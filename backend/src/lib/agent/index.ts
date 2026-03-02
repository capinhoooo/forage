import { prismaQuery } from '../prisma.ts';
import { getWalletAddress, getUsdcBalance, getUsdtBalance, getEthBalance, get4337WalletAddress, getSparkAddress, getSparkBalance } from '../wdk/index.ts';
import { PRIMARY_CHAIN, YIELD_CHAIN, SERVICE_PRICES } from '../wdk/config.ts';
import { AGENT_DAILY_SPEND_LIMIT, ERC8004_AGENT_ID, APP_PORT } from '../../config/main-config.ts';
import { IDENTITY_REGISTRY, REPUTATION_REGISTRY, AGENT_REGISTRY_ID } from '../erc8004/index.ts';
import { getOurReputation } from '../erc8004/reputation.ts';
import {
  determineState,
  calculateRunway,
  getMonthlyBurnEstimate,
  getLifeMeterPercent,
  type AgentStateType,
} from './state-machine.ts';
import { getDailyCosts, estimateMonthlyBurn } from './cost-tracker.ts';
import { getAllPositions } from './yield-router.ts';
import { routeYield } from './yield-router.ts';
import { queryAllRates } from './yield-rates.ts';
import { makeDecision, executeWithTools, type AgentContext } from './decision-engine.ts';
import { paidFetch } from '../payment/payment-client.ts';
import { updateAgentLoopState } from './loop-state.ts';

let agentStartTime: number = Date.now();
let isAgentDead: boolean = false;

// Lightweight skip: track last balance to detect no-change loops
let lastKnownBalanceUsdc = 0n;
let lastKnownRequestCount = 0;
let lastFullLoopTime = 0;

export function getUptimeSeconds(): number {
  return Math.floor((Date.now() - agentStartTime) / 1000);
}

export function isAgentAlive(): boolean {
  return !isAgentDead;
}

export async function getAgentStatus() {
  const walletAddress = await getWalletAddress();
  const balanceUsdc = await getUsdcBalance();
  const balanceUsdt = await getUsdtBalance(); // USDt on Eth Sepolia
  const balanceEth = await getEthBalance();

  // Get yield positions across all protocols
  const positions = await getAllPositions();
  const totalYieldSupplied = positions.reduce((sum, p) => sum + p.supplied, 0n);

  // USDt counts toward total value (1 USDt = 1 USDC for survival)
  const totalValue = balanceUsdc + balanceUsdt + totalYieldSupplied;

  // Use estimated monthly burn from recent data, fall back to default
  let monthlyBurn = await estimateMonthlyBurn();
  if (monthlyBurn <= 0n) monthlyBurn = getMonthlyBurnEstimate();

  const state = determineState(totalValue, monthlyBurn);
  const runway = calculateRunway(totalValue, monthlyBurn);
  const lifeMeter = getLifeMeterPercent(totalValue, monthlyBurn);

  const dailyCosts = await getDailyCosts();

  // Get today's earnings
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEarnings = await prismaQuery.agentTransaction.aggregate({
    where: { type: 'EARN', createdAt: { gte: todayStart } },
    _sum: { amount: true },
  });

  // Get today's requests
  const todayRequests = await prismaQuery.serviceRequest.count({
    where: { createdAt: { gte: todayStart }, status: 'COMPLETED' },
  });

  // Get lifetime stats
  const lifetimeEarnings = await prismaQuery.agentTransaction.aggregate({
    where: { type: 'EARN' },
    _sum: { amount: true },
  });
  const lifetimeRequests = await prismaQuery.serviceRequest.count({
    where: { status: 'COMPLETED' },
  });

  // Get current rates (non-blocking, log errors)
  let rates: Awaited<ReturnType<typeof queryAllRates>> = [];
  try {
    rates = await queryAllRates();
  } catch {
    // Rates query is non-critical
  }

  // Get 4337 wallet address (yield chain)
  let yieldWalletAddress = '';
  try {
    yieldWalletAddress = await get4337WalletAddress();
  } catch {
    // 4337 wallet may not be initialized yet
  }

  // Get Spark (Lightning) address and balance
  let sparkAddress = '';
  let sparkBalance = 0n;
  try {
    [sparkAddress, sparkBalance] = await Promise.all([
      getSparkAddress(),
      getSparkBalance(),
    ]);
  } catch {
    // Spark wallet may not be available
  }

  // Get on-chain reputation (non-blocking)
  let reputation: Awaited<ReturnType<typeof getOurReputation>> = null;
  try {
    reputation = await getOurReputation();
  } catch {
    // Reputation query is non-critical
  }

  return {
    state,
    walletAddress,
    yieldWalletAddress,
    chain: PRIMARY_CHAIN,
    yieldChain: YIELD_CHAIN,
    balanceUsdc: balanceUsdc.toString(),
    balanceUsdt: balanceUsdt.toString(),
    balanceEth: balanceEth.toString(),
    monthlyBurn: monthlyBurn.toString(),
    runway: Number(runway.toFixed(2)),
    lifeMeter: Number(lifeMeter.toFixed(1)),
    yieldPositions: positions.map(p => ({
      protocol: p.protocol,
      chain: p.chain,
      supplied: p.supplied.toString(),
      riskScore: p.riskScore,
      token: p.token,
    })),
    totalYieldSupplied: totalYieldSupplied.toString(),
    currentRates: rates.map(r => ({
      protocol: r.protocol,
      chain: r.chain,
      apy: Number((r.apy * 100).toFixed(4)),
      riskAdjustedApy: Number((r.riskAdjustedApy * 100).toFixed(4)),
    })),
    todayEarnings: (todayEarnings._sum.amount || 0n).toString(),
    todayCosts: dailyCosts.toString(),
    todayRequests,
    totalEarned: (lifetimeEarnings._sum.amount || 0n).toString(),
    totalRequests: lifetimeRequests,
    uptimeSeconds: getUptimeSeconds(),
    isDead: isAgentDead,
    identity: ERC8004_AGENT_ID ? {
      agentId: Number(ERC8004_AGENT_ID),
      registryId: AGENT_REGISTRY_ID,
      identityRegistry: IDENTITY_REGISTRY,
      reputationRegistry: REPUTATION_REGISTRY,
    } : null,
    reputation,
    sparkAddress,
    sparkBalance: sparkBalance.toString(),
    wdkModules: [
      '@tetherto/wdk',
      '@tetherto/wdk-wallet-evm',
      '@tetherto/wdk-wallet-evm-erc-4337',
      '@tetherto/wdk-protocol-lending-aave-evm',
      '@tetherto/wdk-protocol-bridge-usdt0-evm',
      '@tetherto/wdk-protocol-swap-velora-evm',
      '@tetherto/wdk-pricing-bitfinex-http',
      '@tetherto/wdk-secret-manager',
      '@tetherto/wdk-indexer-http',
      '@tetherto/wdk-mcp-toolkit',
      '@tetherto/wdk-wallet-spark',
    ],
    security: {
      seedEncryption: !!process.env.WDK_ENCRYPTION_KEY,
      maxTxAmount: '$10',
      dailySpendLimit: '$5',
      killSwitch: true,
      yieldRiskThreshold: 7.5,
    },
  };
}

export async function runAgentLoop(): Promise<void> {
  if (isAgentDead) {
    console.log('[Agent] Agent is dead. Skipping loop.');
    return;
  }

  console.log('[Agent] Running agent loop...');

  try {
    // 0. Lightweight pre-check: skip full loop if nothing changed (saves ~6 async queries)
    const quickBalance = await getUsdcBalance();
    const quickRequests = await prismaQuery.serviceRequest.count({
      where: { status: 'COMPLETED' },
    });
    const timeSinceFullLoop = Date.now() - lastFullLoopTime;
    const MIN_FULL_LOOP_INTERVAL = 2 * 60 * 1000; // At least 2 min between full loops

    // Balance within $0.01 (10000 base units) and no new requests and ran recently
    const balanceDelta = quickBalance > lastKnownBalanceUsdc
      ? quickBalance - lastKnownBalanceUsdc
      : lastKnownBalanceUsdc - quickBalance;
    const isUnchanged = balanceDelta < 10_000n &&
      quickRequests === lastKnownRequestCount &&
      timeSinceFullLoop < MIN_FULL_LOOP_INTERVAL * 5; // Skip if last full loop was < 10 min ago

    if (isUnchanged && lastFullLoopTime > 0) {
      console.log(`[Agent] Lightweight skip: balance delta $${(Number(balanceDelta) / 1e6).toFixed(4)}, no new requests`);
      return;
    }

    // 1. Get current state (full status query)
    lastFullLoopTime = Date.now();
    lastKnownBalanceUsdc = quickBalance;
    lastKnownRequestCount = quickRequests;

    const status = await getAgentStatus();
    const state = status.state as AgentStateType;

    // Update adaptive loop interval based on current state
    updateAgentLoopState(state);

    console.log(`[Agent] State: ${state} | USDC: $${(Number(status.balanceUsdc) / 1e6).toFixed(2)} | USDt: $${(Number(status.balanceUsdt) / 1e6).toFixed(2)} | Yield: $${(Number(status.totalYieldSupplied) / 1e6).toFixed(2)} | Runway: ${status.runway}mo`);

    // 2. Check if dead (only if agent previously had balance)
    if (state === 'DEAD') {
      const hadBalance = await prismaQuery.agentState.findFirst({
        where: { balanceUsdc: { gt: 0 } },
      });
      if (hadBalance) {
        isAgentDead = true;
        console.log('[Agent] AGENT IS DEAD. Balance depleted.');
      } else {
        console.log('[Agent] No balance yet (waiting for funding). State: CRITICAL');
      }
      await saveAgentState(status);
      return;
    }

    // Guard 2: Daily spend limit check
    const dailySpend = await getDailyCosts();
    const dailyLimit = BigInt(AGENT_DAILY_SPEND_LIMIT);
    if (dailySpend >= dailyLimit) {
      console.log(`[Agent] DAILY SPEND LIMIT reached: $${Number(dailySpend) / 1e6} >= $${Number(dailyLimit) / 1e6}. Skipping costly operations.`);
      await saveAgentState(status);
      await prismaQuery.agentTransaction.create({
        data: {
          type: 'SPEND_LLM',
          amount: 0n,
          token: 'USDC',
          chain: PRIMARY_CHAIN,
          description: `Decision: HOLD (daily spend limit $${Number(dailyLimit) / 1e6} reached)`,
        },
      });
      return;
    }

    // 3. Make decision via Claude
    const context: AgentContext = {
      state,
      balanceUsdc: Number(status.balanceUsdc) / 1e6,
      balanceUsdt: Number(status.balanceUsdt) / 1e6,
      monthlyBurn: Number(status.monthlyBurn) / 1e6,
      runway: status.runway,
      aaveSupplied: Number(status.totalYieldSupplied) / 1e6,
      aaveApy: status.currentRates[0]?.apy || 0,
      todayEarnings: Number(status.todayEarnings) / 1e6,
      todayCosts: Number(status.todayCosts) / 1e6,
      requestsToday: status.todayRequests,
    };

    const decision = await makeDecision(context);
    console.log(`[Agent] Decision: ${decision.action} - ${decision.reasoning}`);

    // 3b. Execute decision via MCP tools (if actionable)
    const YIELD_ACTIONS = ['SUPPLY_AAVE', 'WITHDRAW_AAVE', 'EMERGENCY'];
    let claudeHandledYield = false;

    if (decision.action === 'GATHER_INTELLIGENCE') {
      try {
        await executeGatherIntelligence();
      } catch (err) {
        console.error(`[Agent] GATHER_INTELLIGENCE failed (non-fatal):`, err);
      }
    } else if (decision.action !== 'HOLD') {
      try {
        const executionResult = await executeDecisionAction(decision, context);
        if (executionResult) {
          console.log(`[Agent] Executed ${decision.action}: ${executionResult.toolCalls.length} tool call(s)`);
          claudeHandledYield = YIELD_ACTIONS.includes(decision.action);
        }
      } catch (execError) {
        console.error(`[Agent] Decision execution failed (non-fatal):`, execError);
      }
    }

    // 4. Execute yield routing (skip if Claude already handled yield to avoid duplicates)
    let yieldRouterAction = 'SKIPPED';
    if (claudeHandledYield) {
      console.log(`[Agent] Yield Router: SKIPPED (Claude handled ${decision.action} via tools)`);
    } else {
      const monthlyBurn = BigInt(status.monthlyBurn);
      const liquidBalance = BigInt(status.balanceUsdc);

      const routerResult = await routeYield(state, liquidBalance, monthlyBurn);
      yieldRouterAction = routerResult.action;
      console.log(`[Agent] Yield Router: ${routerResult.action} - ${routerResult.reasoning}`);
    }

    // 5. Save state snapshot
    await saveAgentState(status);

    // 6. Log decision as transaction (with actual LLM cost)
    await prismaQuery.agentTransaction.create({
      data: {
        type: 'SPEND_LLM',
        amount: decision.llmCost || 0n,
        token: 'USDC',
        chain: PRIMARY_CHAIN,
        description: `Decision: ${decision.action} - ${decision.reasoning}`,
        metadata: JSON.stringify({ decision: { action: decision.action, reasoning: decision.reasoning, details: decision.details }, yieldRouter: yieldRouterAction }),
      },
    });
  } catch (error) {
    console.error('[Agent] Loop error:', error);
  }
}

async function saveAgentState(status: Awaited<ReturnType<typeof getAgentStatus>>): Promise<void> {
  await prismaQuery.agentState.create({
    data: {
      state: status.state,
      balanceUsdc: BigInt(status.balanceUsdc),
      balanceUsdt: BigInt(status.balanceUsdt),
      balanceEth: BigInt(status.balanceEth),
      monthlyBurn: BigInt(status.monthlyBurn),
      runway: status.runway,
      aaveSupplied: BigInt(status.totalYieldSupplied),
      aaveApy: status.currentRates[0]?.apy || 0,
      totalEarned: BigInt(status.totalEarned),
      totalSpent: BigInt(status.todayCosts),
      requestsServed: status.totalRequests,
      uptimeSeconds: status.uptimeSeconds,
      chain: PRIMARY_CHAIN,
      walletAddress: status.walletAddress,
    },
  });
}

export function resetAgent(): void {
  agentStartTime = Date.now();
  isAgentDead = false;
  console.log('[Agent] Agent reset.');
}

/**
 * Agent pays its own /summarize service via paidFetch.
 * Demonstrates the autonomous agent-to-agent payment loop:
 *   1. Agent decides to gather intelligence
 *   2. Calls paidFetch() which handles the 402 cycle
 *   3. WDK signs EIP-3009 transferWithAuthorization
 *   4. On-chain USDC settlement
 *   5. Service delivers result
 *   6. Agent logs spend
 */
async function executeGatherIntelligence(): Promise<void> {
  const topic = `Current DeFi yield rates and optimal strategy for autonomous agent treasury management on Base Sepolia and Ethereum Sepolia testnets`;
  const url = `http://localhost:${APP_PORT}/services/summarize?text=${encodeURIComponent(topic)}`;

  console.log(`[Agent] GATHER_INTELLIGENCE: Paying $${(SERVICE_PRICES.summarize / 1e6).toFixed(4)} to consume /summarize`);

  const response = await paidFetch(url);
  const paid = response.headers.has('payment-response');
  const body = await response.json() as { success: boolean; data?: { summary?: string } };

  console.log(`[Agent] GATHER_INTELLIGENCE: Status=${response.status}, Paid=${paid}`);

  if (body.success && body.data?.summary) {
    console.log(`[Agent] Intelligence received: "${body.data.summary.slice(0, 120)}..."`);
  }

  // Log as SPEND_SERVICE
  await prismaQuery.agentTransaction.create({
    data: {
      type: 'SPEND_LLM', // reuse existing type (SPEND_SERVICE not in schema)
      amount: BigInt(SERVICE_PRICES.summarize),
      token: 'USDC',
      chain: PRIMARY_CHAIN,
      description: `GATHER_INTELLIGENCE: Paid /summarize ($${(SERVICE_PRICES.summarize / 1e6).toFixed(4)}) [paid=${paid}]`,
      metadata: JSON.stringify({
        action: 'GATHER_INTELLIGENCE',
        endpoint: '/services/summarize',
        paid,
        statusCode: response.status,
        summaryPreview: body.data?.summary?.slice(0, 200),
      }),
    },
  });
}

/**
 * Map a decision action to an MCP tool instruction and execute it.
 * Returns null for actions that don't need MCP execution.
 */
async function executeDecisionAction(
  decision: { action: string; reasoning: string; details?: Record<string, unknown> },
  context: AgentContext,
): Promise<Awaited<ReturnType<typeof executeWithTools>> | null> {
  const instructionMap: Record<string, string> = {
    SUPPLY_AAVE: `You need to supply USDC to Aave V3 for yield. First use getYieldPositions to check current rates. Then use getTokenBalance to check available USDC on base-sepolia. Keep at least $${(context.monthlyBurn * 2).toFixed(2)} as reserve (2x monthly burn). Supply the surplus using supplyToAave. Report what you did.`,
    WITHDRAW_AAVE: `URGENT: Withdraw USDC from Aave V3 back to wallet. First use getYieldPositions to see what's supplied. Then use withdrawFromAave with amountUsdc=0 to withdraw everything. Report the result.`,
    ADJUST_PRICING: `Check the agent's financial health. Use getTokenBalance on base-sepolia for USDC, and getYieldPositions for DeFi positions. Report the current balances and rates so pricing can be adjusted.`,
    REDUCE_COSTS: `The agent needs to reduce costs. Check all balances using getTokenBalance on base-sepolia for USDC, and getCurrentPrice for ETH/USD. Report the complete financial status.`,
    EMERGENCY: `EMERGENCY MODE. Immediately use withdrawFromAave with amountUsdc=0 to pull all funds from Aave. Then use getTokenBalance on base-sepolia for USDC to confirm wallet balance. Report everything.`,
    SWAP_TOKENS: `Execute a token swap on Base Sepolia via Velora DEX. First use quoteSwap to get the best rate for swapping USDC to another token (or vice versa). If the quote looks favorable, execute the swap. Use tokenIn and tokenOut as contract addresses, tokenInAmount in base units. Chain: base-sepolia. Report the swap result including amounts and fees.`,
  };

  const instruction = instructionMap[decision.action];
  if (!instruction) return null;

  return executeWithTools(instruction);
}
