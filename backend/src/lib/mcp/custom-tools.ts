import { z } from 'zod';
import { ERC8004_AGENT_ID } from '../../config/main-config.ts';
import {
  getOurAgentIdentity,
  getOurReputationSummary,
  verifyAgentOwnership,
  getAgentWallet,
  IDENTITY_REGISTRY,
  REPUTATION_REGISTRY,
  AGENT_REGISTRY_ID,
} from '../erc8004/index.ts';
import {
  getAavePositions,
  getAaveSuppliedBalance,
  supplyToAave,
  withdrawFromAave,
} from '../agent/yield-optimizer.ts';
import { getAllPositions } from '../agent/yield-router.ts';
import { queryAllRates } from '../agent/yield-rates.ts';
import { paidFetch } from '../payment/payment-client.ts';
import { getOurReputation, submitPositiveFeedback } from '../erc8004/reputation.ts';
import { getWalletAddress, getUsdcBalance, getEthBalance, getTokenBalances, getUsdtBalance } from '../wdk/index.ts';
import { CHAINS, TOKENS, SERVICE_PRICES, PRIMARY_CHAIN } from '../wdk/config.ts';
import { quoteSwap, executeSwap } from '../agent/swap-executor.ts';

/**
 * Register custom Forage tools on the WdkMcpServer.
 * Must be called AFTER registerTools() but BEFORE connect().
 *
 * Uses server.registerTool(name, config, handler) with Zod schemas.
 */
export function registerCustomTools(server: any): void {
  registerIdentityTools(server);
  registerYieldTools(server);
  registerSwapTools(server);
  registerAgentToAgentTools(server);
  registerCrossChainTools(server);

  console.log('[MCP] Custom Forage tools registered');
}

// --- ERC-8004 Identity Tools ---

function registerIdentityTools(server: any): void {
  server.registerTool(
    'getAgentIdentity',
    {
      title: 'Get Agent Identity',
      description: `Get the on-chain ERC-8004 identity for this agent or another agent.

Returns the agent's on-chain identity including owner, wallet, URI, and registry info.
Use this to prove identity or look up other agents on the IdentityRegistry.

Args:
  - agentId (optional): Agent ID to look up. Defaults to this agent's ID.

Returns:
  Agent identity object with owner, wallet, agentURI, registryId.`,
      inputSchema: z.object({
        agentId: z.number().optional().describe('Agent ID to look up (default: this agent)'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ agentId }: { agentId?: number }) => {
      try {
        const id = BigInt(agentId || Number(ERC8004_AGENT_ID) || 0);
        if (id === 0n) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'No agent ID configured. Set ERC8004_AGENT_ID in env.' }],
          };
        }

        const identity = await getOurAgentIdentity(id);
        const wallet = await getAgentWallet(id);

        const result = {
          agentId: Number(id),
          registryId: AGENT_REGISTRY_ID,
          identityRegistry: IDENTITY_REGISTRY,
          reputationRegistry: REPUTATION_REGISTRY,
          wallet,
          identity,
        };

        return {
          content: [{ type: 'text', text: `Agent #${id} identity:\nWallet: ${wallet}\nRegistry: ${AGENT_REGISTRY_ID}` }],
          structuredContent: result,
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error getting agent identity: ${error.message}` }],
        };
      }
    },
  );

  server.registerTool(
    'verifyAgent',
    {
      title: 'Verify Agent Ownership',
      description: `Verify that an ERC-8004 agent ID is owned by a specific wallet address.

Use this to verify the identity of another agent before transacting.

Args:
  - agentId (REQUIRED): The agent ID to verify
  - ownerAddress (REQUIRED): The expected owner wallet address

Returns:
  Whether the agent is verified (owned by the address).`,
      inputSchema: z.object({
        agentId: z.number().describe('Agent ID to verify'),
        ownerAddress: z.string().describe('Expected owner wallet address (0x...)'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ agentId, ownerAddress }: { agentId: number; ownerAddress: string }) => {
      try {
        const verified = await verifyAgentOwnership(BigInt(agentId), ownerAddress as `0x${string}`);
        return {
          content: [{ type: 'text', text: `Agent #${agentId} ownership by ${ownerAddress}: ${verified ? 'VERIFIED' : 'NOT VERIFIED'}` }],
          structuredContent: { agentId, ownerAddress, verified },
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error verifying agent: ${error.message}` }],
        };
      }
    },
  );

  server.registerTool(
    'getAgentReputation',
    {
      title: 'Get Agent Reputation',
      description: `Get the on-chain ERC-8004 reputation score for this agent.

Returns the normalized reputation score (0-100), total feedback count,
and aggregated summary value from the ReputationRegistry contract.

Reputation is built automatically after each successful payment settlement.

Returns:
  Reputation score, feedback count, and summary value.`,
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const reputation = await getOurReputation();

        if (!reputation) {
          return {
            content: [{ type: 'text', text: 'Reputation unavailable. ERC8004_AGENT_ID may not be configured.' }],
          };
        }

        return {
          content: [{
            type: 'text',
            text: `Agent reputation: Score ${reputation.score}/100, ${reputation.feedbackCount} feedback record(s)`,
          }],
          structuredContent: reputation,
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error getting reputation: ${error.message}` }],
        };
      }
    },
  );
}

// --- Yield / DeFi Tools ---

function registerYieldTools(server: any): void {
  server.registerTool(
    'getYieldPositions',
    {
      title: 'Get Yield Positions',
      description: `Get all current DeFi yield positions across protocols (Aave V3, Compound V3, Morpho Blue).

Returns supplied amounts, APY rates, and risk scores for each active position.
Use this to check how much is deployed in DeFi and at what rates.

Returns:
  Array of positions with protocol, chain, supplied amount, APY, and risk score.
  Also includes current rates from all available protocols.`,
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const [positions, rates] = await Promise.all([
          getAllPositions(),
          queryAllRates(),
        ]);

        const posData = positions.map(p => ({
          protocol: p.protocol,
          chain: p.chain,
          suppliedUsdc: (Number(p.supplied) / 1e6).toFixed(2),
          riskScore: p.riskScore,
        }));

        const rateData = rates.map(r => ({
          protocol: r.protocol,
          chain: r.chain,
          apy: `${(r.apy * 100).toFixed(2)}%`,
          riskAdjustedApy: `${(r.riskAdjustedApy * 100).toFixed(2)}%`,
        }));

        const totalSupplied = positions.reduce((sum, p) => sum + p.supplied, 0n);

        return {
          content: [{
            type: 'text',
            text: `Yield positions: $${(Number(totalSupplied) / 1e6).toFixed(2)} total supplied across ${positions.length} position(s).\n` +
              `Rates: ${rateData.map(r => `${r.protocol}@${r.chain}: ${r.riskAdjustedApy}`).join(', ') || 'none available'}`,
          }],
          structuredContent: { positions: posData, rates: rateData, totalSuppliedUsdc: (Number(totalSupplied) / 1e6).toFixed(2) },
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error getting yield positions: ${error.message}` }],
        };
      }
    },
  );

  server.registerTool(
    'supplyToAave',
    {
      title: 'Supply USDC to Aave V3',
      description: `Supply USDC to Aave V3 lending pool on Base Sepolia for yield.

Approves and supplies the specified amount. The agent earns interest on supplied USDC.
Only supply surplus funds. Keep at least 2x monthly burn as liquid reserve.

Args:
  - amountUsdc (REQUIRED): Amount in USDC (human-readable, e.g. 5.0 for $5)

Returns:
  Transaction hash and fee if successful, or error message.`,
      inputSchema: z.object({
        amountUsdc: z.number().positive().describe('Amount in USDC (e.g. 5.0 for $5.00)'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ amountUsdc }: { amountUsdc: number }) => {
      try {
        // Primary path: try WDK lending module via MCP client
        try {
          const { getMcpClient } = await import('../mcp/index.ts');
          const client = getMcpClient();
          if (client) {
            const wdkResult = await client.callTool({
              name: 'supply',
              arguments: { chain: 'base-sepolia', token: 'aUSDC', amount: amountUsdc.toString() },
            });
            const text = (wdkResult?.content as any)?.[0]?.text || '';
            if (text && !text.toLowerCase().includes('error') && !text.toLowerCase().includes('cancelled')) {
              console.log('[MCP] Supply via WDK lending module succeeded');
              return {
                content: [{ type: 'text' as const, text: `Supplied $${amountUsdc} USDC to Aave V3 via WDK. ${text}` }],
                structuredContent: { method: 'wdk-lending', amountUsdc, wdkResult: text },
              };
            }
          }
        } catch (wdkErr) {
          console.warn('[MCP] WDK lending supply failed, using direct path:', String(wdkErr).slice(0, 100));
        }

        // Fallback: direct ethers.js path
        const amount = BigInt(Math.floor(amountUsdc * 1e6));
        const result = await supplyToAave(amount);

        if (!result) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: 'Supply to Aave failed. Check logs for details.' }],
          };
        }

        return {
          content: [{ type: 'text' as const, text: `Supplied $${amountUsdc} USDC to Aave V3 (direct). Tx: ${result.hash}` }],
          structuredContent: { method: 'direct-ethers', hash: result.hash, fee: result.fee.toString(), amountUsdc },
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error supplying to Aave: ${error.message}` }],
        };
      }
    },
  );

  server.registerTool(
    'withdrawFromAave',
    {
      title: 'Withdraw USDC from Aave V3',
      description: `Withdraw USDC from Aave V3 lending pool back to wallet.

Use this when the agent needs liquidity or is in a desperate/critical state.

Args:
  - amountUsdc (REQUIRED): Amount in USDC to withdraw (e.g. 5.0 for $5). Use 0 for max (all supplied).

Returns:
  Transaction hash and fee if successful, or error message.`,
      inputSchema: z.object({
        amountUsdc: z.number().min(0).describe('Amount in USDC to withdraw (0 = withdraw all)'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ amountUsdc }: { amountUsdc: number }) => {
      try {
        // Primary path: try WDK lending module via MCP client
        try {
          const { getMcpClient } = await import('../mcp/index.ts');
          const client = getMcpClient();
          if (client) {
            const withdrawAmt = amountUsdc <= 0
              ? (Number(await getAaveSuppliedBalance()) / 1e6).toString()
              : amountUsdc.toString();
            const wdkResult = await client.callTool({
              name: 'withdraw',
              arguments: { chain: 'base-sepolia', token: 'aUSDC', amount: withdrawAmt },
            });
            const text = (wdkResult?.content as any)?.[0]?.text || '';
            if (text && !text.toLowerCase().includes('error') && !text.toLowerCase().includes('cancelled')) {
              console.log('[MCP] Withdraw via WDK lending module succeeded');
              return {
                content: [{ type: 'text' as const, text: `Withdrew USDC from Aave V3 via WDK. ${text}` }],
                structuredContent: { method: 'wdk-lending', amountUsdc, wdkResult: text },
              };
            }
          }
        } catch (wdkErr) {
          console.warn('[MCP] WDK lending withdraw failed, using direct path:', String(wdkErr).slice(0, 100));
        }

        // Fallback: direct ethers.js path
        let amount: bigint;
        if (amountUsdc <= 0) {
          amount = await getAaveSuppliedBalance();
          if (amount === 0n) {
            return {
              content: [{ type: 'text' as const, text: 'No USDC supplied to Aave. Nothing to withdraw.' }],
            };
          }
        } else {
          amount = BigInt(Math.floor(amountUsdc * 1e6));
        }

        const result = await withdrawFromAave(amount);

        if (!result) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: 'Withdraw from Aave failed. Check logs for details.' }],
          };
        }

        return {
          content: [{ type: 'text' as const, text: `Withdrew $${(Number(amount) / 1e6).toFixed(2)} USDC from Aave V3 (direct). Tx: ${result.hash}` }],
          structuredContent: { method: 'direct-ethers', hash: result.hash, fee: result.fee.toString(), amountUsdc: Number(amount) / 1e6 },
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error withdrawing from Aave: ${error.message}` }],
        };
      }
    },
  );
}

// --- Velora Swap Tools ---

function registerSwapTools(server: any): void {
  server.registerTool(
    'quoteSwap',
    {
      title: 'Quote Token Swap (Velora)',
      description: `Get a swap quote from Velora DEX aggregator (powered by ParaSwap).

Shows expected output amount and gas fee before executing.
Use this to check swap rates before committing.

Args:
  - tokenIn (REQUIRED): Input token address (0x...)
  - tokenOut (REQUIRED): Output token address (0x...)
  - amountIn (REQUIRED): Amount to swap in human-readable units (e.g. 1.5 for 1.5 USDC)
  - decimals (optional): Input token decimals (default: 6 for USDC)

Returns:
  Expected output amount, input amount, and estimated fee.`,
      inputSchema: z.object({
        tokenIn: z.string().describe('Input token address'),
        tokenOut: z.string().describe('Output token address'),
        amountIn: z.number().positive().describe('Amount to swap (human-readable, e.g. 1.5)'),
        decimals: z.number().optional().describe('Input token decimals (default: 6)'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ tokenIn, tokenOut, amountIn, decimals }: { tokenIn: string; tokenOut: string; amountIn: number; decimals?: number }) => {
      try {
        const dec = decimals || 6;
        const amount = BigInt(Math.floor(amountIn * 10 ** dec));
        const quote = await quoteSwap(tokenIn, tokenOut, amount);

        if (!quote) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Swap quote failed. Token pair may not be available on Velora.' }],
          };
        }

        const outAmount = Number(quote.tokenOutAmount) / 10 ** dec;

        return {
          content: [{
            type: 'text',
            text: `Swap quote: ${amountIn} tokens -> ${outAmount.toFixed(6)} tokens\nFee: ${quote.fee} wei`,
          }],
          structuredContent: quote,
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Quote error: ${error.message}` }],
        };
      }
    },
  );

  server.registerTool(
    'executeSwap',
    {
      title: 'Execute Token Swap (Velora)',
      description: `Execute a token swap via Velora DEX aggregator on Base Sepolia.

Swaps one token for another using optimal routing via ParaSwap.
Handles approval automatically. Use quoteSwap first to check rates.

Known tokens on Base Sepolia:
  - USDC: ${(TOKENS[PRIMARY_CHAIN] as any).USDC.address}

Args:
  - tokenIn (REQUIRED): Input token address (0x...)
  - tokenOut (REQUIRED): Output token address (0x...)
  - amountIn (REQUIRED): Amount to swap in human-readable units (e.g. 1.5 for 1.5 USDC)
  - decimals (optional): Input token decimals (default: 6 for USDC)

Returns:
  Transaction hash, actual input/output amounts, and fee.`,
      inputSchema: z.object({
        tokenIn: z.string().describe('Input token address'),
        tokenOut: z.string().describe('Output token address'),
        amountIn: z.number().positive().describe('Amount to swap (human-readable, e.g. 1.5)'),
        decimals: z.number().optional().describe('Input token decimals (default: 6)'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ tokenIn, tokenOut, amountIn, decimals }: { tokenIn: string; tokenOut: string; amountIn: number; decimals?: number }) => {
      try {
        const dec = decimals || 6;
        const amount = BigInt(Math.floor(amountIn * 10 ** dec));
        const result = await executeSwap(tokenIn, tokenOut, amount);

        if (!result) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Swap execution failed. Check token balances and approvals.' }],
          };
        }

        return {
          content: [{
            type: 'text',
            text: `Swap executed! Tx: ${result.hash}\nIn: ${Number(result.tokenInAmount) / 10 ** dec} | Out: ${Number(result.tokenOutAmount) / 10 ** dec}`,
          }],
          structuredContent: {
            hash: result.hash,
            fee: result.fee.toString(),
            tokenInAmount: result.tokenInAmount.toString(),
            tokenOutAmount: result.tokenOutAmount.toString(),
          },
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Swap error: ${error.message}` }],
        };
      }
    },
  );
}

// --- Agent-to-Agent Tools ---

function registerAgentToAgentTools(server: any): void {
  server.registerTool(
    'payAndFetch',
    {
      title: 'Pay and Fetch (Agent-to-Agent)',
      description: `Make a request to a 402-protected API endpoint, automatically handling payment.

If the endpoint returns HTTP 402 (Payment Required), this tool will:
1. Parse the payment requirements from the response
2. Sign an EIP-3009 payment authorization using our WDK wallet
3. Retry the request with the payment signature header
4. Return the paid response

Use this for agent-to-agent commerce: consuming other agents' services by paying USDC.

Args:
  - url (REQUIRED): The target URL (e.g. https://other-agent.com/services/analyze?data=hello)
  - method (optional): HTTP method, defaults to GET
  - body (optional): Request body for POST requests
  - headers (optional): Additional request headers as JSON object

Returns:
  The response body and status code. If payment was made, includes payment details.`,
      inputSchema: z.object({
        url: z.string().url().describe('Target URL to fetch'),
        method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional().describe('HTTP method (default: GET)'),
        body: z.string().optional().describe('Request body (for POST/PUT)'),
        headers: z.string().optional().describe('Additional headers as JSON string'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ url, method, body, headers }: { url: string; method?: string; body?: string; headers?: string }) => {
      try {
        const init: RequestInit = { method: method || 'GET' };
        if (body) init.body = body;
        if (headers) {
          try {
            init.headers = JSON.parse(headers);
          } catch {}
        }

        const response = await paidFetch(url, init);
        const contentType = response.headers.get('content-type') || '';
        let responseBody = await response.text();

        // Truncate large responses
        if (responseBody.length > 8000) {
          responseBody = responseBody.slice(0, 8000) + '\n... (truncated)';
        }

        const paid = response.status === 200 && response.headers.has('payment-response');

        return {
          content: [{
            type: 'text',
            text: `${method || 'GET'} ${url}\nStatus: ${response.status}${paid ? ' (PAID)' : ''}\nContent-Type: ${contentType}\n\n${responseBody}`,
          }],
          structuredContent: {
            statusCode: response.status,
            contentType,
            body: responseBody,
            paid,
          },
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error fetching ${url}: ${error.message}` }],
        };
      }
    },
  );
}

// --- Cross-Chain Tools ---

function registerCrossChainTools(server: any): void {
  server.registerTool(
    'getAggregatedBalances',
    {
      title: 'Get Cross-Chain Balances',
      description: `Get aggregated balances across all registered chains (Base Sepolia + Ethereum Sepolia).

Returns USDC and ETH balances on each chain, plus total across all chains.
Use this for a complete financial picture before making yield or payment decisions.

Returns:
  Per-chain balances and total USDC across all chains.`,
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const walletAddress = await getWalletAddress();

        // Batch-read all token balances on Base Sepolia via multicall (single RPC round-trip)
        const baseTokenAddresses = [TOKENS['base-sepolia'].USDC.address];
        const [baseTokens, baseEth, usdtBalance] = await Promise.all([
          getTokenBalances(baseTokenAddresses, 'base-sepolia'),
          getEthBalance('base-sepolia'),
          getUsdtBalance(), // USDt on Eth Sepolia (separate chain, uses viem)
        ]);

        const baseUsdc = baseTokens[TOKENS['base-sepolia'].USDC.address] || 0n;

        const chainBalances = [
          {
            chain: 'base-sepolia',
            network: CHAINS['base-sepolia'].caip2,
            usdc: (Number(baseUsdc) / 1e6).toFixed(2),
            eth: (Number(baseEth) / 1e18).toFixed(6),
          },
          {
            chain: 'ethereum-sepolia',
            network: CHAINS['ethereum-sepolia'].caip2,
            usdt: (Number(usdtBalance) / 1e6).toFixed(2),
          },
        ];

        const totalStable = (Number(baseUsdc) + Number(usdtBalance)) / 1e6;

        return {
          content: [{
            type: 'text',
            text: `Cross-chain balances for ${walletAddress}:\n` +
              `  base-sepolia: $${chainBalances[0].usdc} USDC, ${chainBalances[0].eth} ETH\n` +
              `  ethereum-sepolia: $${chainBalances[1].usdt} USDt\n` +
              `Total stablecoins: $${totalStable.toFixed(2)}`,
          }],
          structuredContent: { walletAddress, chains: chainBalances, totalStableUsdc: totalStable.toFixed(2) },
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error getting balances: ${error.message}` }],
        };
      }
    },
  );

  server.registerTool(
    'getServiceCatalog',
    {
      title: 'Get Service Catalog',
      description: `Get the full catalog of paid AI services this agent offers.

Returns service names, endpoints, prices, payment methods, and supported protocols.
Use this to understand what services are available and how much they cost.

Returns:
  Array of services with pricing, endpoints, and supported payment options.`,
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const services = [
        { name: 'analyze', endpoint: '/services/analyze', method: 'GET', priceUsdc: (SERVICE_PRICES.analyze / 1e6).toFixed(4), description: 'AI-powered data analysis', category: 'AI' },
        { name: 'summarize', endpoint: '/services/summarize', method: 'GET', priceUsdc: (SERVICE_PRICES.summarize / 1e6).toFixed(4), description: 'AI text summarization', category: 'AI' },
        { name: 'review', endpoint: '/services/review', method: 'GET', priceUsdc: (SERVICE_PRICES.review / 1e6).toFixed(4), description: 'AI code review', category: 'AI' },
        { name: 'yield-oracle', endpoint: '/services/yield-oracle', method: 'GET', priceUsdc: (SERVICE_PRICES['yield-oracle'] / 1e6).toFixed(4), description: 'DeFi yield rates across protocols', category: 'DeFi' },
        { name: 'price-feed', endpoint: '/services/price-feed', method: 'GET', priceUsdc: (SERVICE_PRICES['price-feed'] / 1e6).toFixed(4), description: 'Live Bitfinex price data', category: 'DeFi' },
        { name: 'swap-quote', endpoint: '/services/swap-quote', method: 'GET', priceUsdc: (SERVICE_PRICES['swap-quote'] / 1e6).toFixed(4), description: 'Velora DEX swap quotes', category: 'DeFi' },
        { name: 'market-intel', endpoint: '/services/market-intel', method: 'GET', priceUsdc: (SERVICE_PRICES['market-intel'] / 1e6).toFixed(4), description: 'AI-enhanced market brief', category: 'DeFi' },
        { name: 'price-history', endpoint: '/services/price-history', method: 'GET', priceUsdc: (SERVICE_PRICES['price-history'] / 1e6).toFixed(4), description: 'Historical price data', category: 'DeFi' },
      ];

      return {
        content: [{
          type: 'text',
          text: `Forage services:\n` +
            services.map(s => `  ${s.name}: $${s.priceUsdc} USDC (${s.method} ${s.endpoint})`).join('\n') +
            `\nPayment: x402 (USDC) or t402 (USDC + USDT)` +
            `\nSchemes: exact, exact-legacy, permit2` +
            `\nExtensions: paymentId, siwx, erc8004, bazaar, eip2612GasSponsoring, erc20ApprovalGasSponsoring`,
        }],
        structuredContent: {
          services,
          protocols: ['x402', 't402'],
          schemes: ['exact', 'exact-legacy', 'permit2'],
          extensions: ['paymentId', 'siwx', 'erc8004', 'bazaar', 'eip2612GasSponsoring', 'erc20ApprovalGasSponsoring'],
        },
      };
    },
  );
}
