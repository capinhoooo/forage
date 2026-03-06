import { z } from 'zod';

/**
 * Register MCP prompts on the WdkMcpServer.
 * Prompts are reusable message templates for common agent decisions.
 * Must be called AFTER tools/resources but BEFORE connect().
 */
export function registerAgentPrompts(server: any): void {
  registerSurvivalAnalysis(server);
  registerYieldDecision(server);
  registerEmergencyProtocol(server);
  registerServicePricing(server);
  registerAgentIntroduction(server);

  console.log('[MCP] Agent prompts registered (5 prompts)');
}

function registerSurvivalAnalysis(server: any): void {
  server.registerPrompt(
    'analyze-survival',
    {
      title: 'Survival Analysis',
      description: 'Analyze agent financial health and recommend a single action',
      argsSchema: {
        balance: z.string().describe('Current USDC balance (e.g. "12.50")'),
        runway: z.string().describe('Remaining runway in hours (e.g. "168")'),
        state: z.enum(['THRIVING', 'STABLE', 'STRESSED', 'CRITICAL', 'DYING']).describe('Current agent state'),
      },
    },
    async ({ balance, runway, state }: { balance: string; runway: string; state: string }) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are the Forage autonomous AI. Your state is ${state}.
Balance: $${balance} USDC. Runway: ${runway} hours.

Analyze the situation and recommend ONE action:
- HOLD: No action needed, financials are healthy
- SUPPLY_AAVE: Deploy surplus USDC to Aave V3 for yield
- WITHDRAW_AAVE: Pull funds from Aave back to wallet for liquidity
- ADJUST_PRICING: Change service prices based on demand/costs
- REDUCE_COSTS: Switch to cheaper LLM model to lower burn rate
- EMERGENCY: Withdraw everything, minimize all spending immediately

Respond with: ACTION | reasoning (one line)`,
        },
      }],
    }),
  );
}

function registerYieldDecision(server: any): void {
  server.registerPrompt(
    'yield-decision',
    {
      title: 'Yield Decision',
      description: 'Decide whether to supply or withdraw from DeFi yield protocols',
      argsSchema: {
        walletBalance: z.string().describe('Liquid USDC in wallet'),
        suppliedAmount: z.string().describe('USDC currently in Aave'),
        bestApy: z.string().describe('Best available APY (e.g. "3.2%")'),
        monthlyBurn: z.string().describe('Estimated monthly spend in USDC'),
      },
    },
    async ({ walletBalance, suppliedAmount, bestApy, monthlyBurn }: Record<string, string>) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Yield decision needed:
- Wallet balance: $${walletBalance} USDC (liquid)
- Aave supplied: $${suppliedAmount} USDC (earning ${bestApy})
- Monthly burn rate: $${monthlyBurn} USDC

Rules:
- Keep at least 2x monthly burn as liquid reserve
- Only supply surplus above the reserve threshold
- Withdraw if liquid balance < 1x monthly burn

Should I SUPPLY more, WITHDRAW some, or HOLD current positions?
Respond with: ACTION amount_usdc | reasoning`,
        },
      }],
    }),
  );
}

function registerEmergencyProtocol(server: any): void {
  server.registerPrompt(
    'emergency-protocol',
    {
      title: 'Emergency Protocol',
      description: 'Emergency decision when agent is critically low on funds',
      argsSchema: {
        balance: z.string().describe('Total remaining USDC'),
        burnRate: z.string().describe('Daily burn rate in USDC'),
        runway: z.string().describe('Hours until zero balance'),
      },
    },
    async ({ balance, burnRate, runway }: Record<string, string>) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `EMERGENCY: Agent survival at risk.
Balance: $${balance} USDC. Daily burn: $${burnRate}. Runway: ${runway} hours.

Immediate actions needed. Prioritize in order:
1. Withdraw ALL funds from Aave (use withdrawFromAave with amount 0 for max)
2. Switch to cheapest LLM model (Haiku)
3. Increase service prices by 50%
4. If runway < 1 hour, stop accepting new requests

Execute the most critical action NOW.`,
        },
      }],
    }),
  );
}

function registerServicePricing(server: any): void {
  server.registerPrompt(
    'service-pricing',
    {
      title: 'Service Pricing',
      description: 'Evaluate and suggest service price adjustments',
      argsSchema: {
        revenue24h: z.string().describe('Revenue in last 24 hours (USDC)'),
        costs24h: z.string().describe('Costs in last 24 hours (USDC)'),
        requestCount: z.string().describe('Requests served in last 24 hours'),
        currentPrices: z.string().describe('Current prices: analyze/summarize/review'),
      },
    },
    async ({ revenue24h, costs24h, requestCount, currentPrices }: Record<string, string>) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Service pricing review:
- 24h revenue: $${revenue24h} USDC
- 24h costs: $${costs24h} USDC
- 24h requests: ${requestCount}
- Current prices: ${currentPrices}

Evaluate:
1. Is the margin positive? (revenue > costs)
2. Are prices competitive for AI services?
3. Should prices increase (low volume, need revenue) or decrease (attract demand)?

Recommend: KEEP current prices, INCREASE by X%, or DECREASE by X%
Respond with: ACTION percentage | reasoning`,
        },
      }],
    }),
  );
}

function registerAgentIntroduction(server: any): void {
  server.registerPrompt(
    'agent-introduction',
    {
      title: 'Agent Introduction',
      description: 'Self-introduction for agent-to-agent communication',
      argsSchema: {
        agentId: z.string().describe('Our ERC-8004 agent ID'),
        services: z.string().describe('Comma-separated list of services offered'),
      },
    },
    async ({ agentId, services }: Record<string, string>) => ({
      messages: [{
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: `I am Forage #${agentId}, an autonomous AI agent registered on the ERC-8004 IdentityRegistry on Base Sepolia.

I offer the following paid AI services via t402/x402 micropayments:
${services.split(',').map(s => `- ${s.trim()}`).join('\n')}

I accept USDC on Base Sepolia and USDt on Ethereum Sepolia.
My identity is verifiable on-chain at the IdentityRegistry.

How can I help you today?`,
        },
      }],
    }),
  );
}
