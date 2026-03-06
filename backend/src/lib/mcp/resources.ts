import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prismaQuery } from '../prisma.ts';
import { ERC8004_AGENT_ID } from '../../config/main-config.ts';
import { IDENTITY_REGISTRY, REPUTATION_REGISTRY, AGENT_REGISTRY_ID } from '../erc8004/index.ts';
import { getOurReputation } from '../erc8004/reputation.ts';
import { getAllPositions } from '../agent/yield-router.ts';
import { queryAllRates } from '../agent/yield-rates.ts';
import { SERVICE_PRICES, PRIMARY_CHAIN, YIELD_CHAIN, CHAINS } from '../wdk/config.ts';
import { getAllDiscoveryExtensions } from '../payment/discovery.ts';
import { getWalletAddress, getUsdcBalance, getEthBalance } from '../wdk/index.ts';

let serverRef: any = null;

/**
 * Register MCP resources on the WdkMcpServer.
 * Resources expose agent state as readable URIs (no tool calls needed).
 * Must be called AFTER tools but BEFORE connect().
 */
export function registerAgentResources(server: any): void {
  serverRef = server;
  registerStatusResource(server);
  registerPositionsResource(server);
  registerIdentityResource(server);
  registerConfigResource(server);
  registerTransactionsResource(server);
  registerServicesResource(server);

  console.log('[MCP] Agent resources registered (6 resources, subscriptions enabled)');
}

/**
 * Notify subscribed clients that a resource has been updated.
 * Call this after state changes (balance update, yield operation, state transition).
 */
export async function notifyResourceUpdate(uri: string): Promise<void> {
  if (!serverRef) return;
  try {
    await serverRef.sendResourceUpdated({ uri });
  } catch {
    // Client may not be subscribed; ignore
  }
}

/**
 * Notify all key resource updates (convenience for agent loop).
 */
export async function notifyAllResourcesUpdated(): Promise<void> {
  await Promise.allSettled([
    notifyResourceUpdate('agent://status'),
    notifyResourceUpdate('agent://positions'),
    notifyResourceUpdate('agent://identity'),
  ]);
}

// --- agent://status ---

function registerStatusResource(server: any): void {
  server.registerResource(
    'agentStatus',
    'agent://status',
    {
      description: 'Current agent state: balance, runway, state, and daily metrics',
      mimeType: 'application/json',
    },
    async () => {
      try {
        const latestState = await prismaQuery.agentState.findFirst({
          orderBy: { createdAt: 'desc' },
        });

        const walletAddress = await getWalletAddress();
        const balanceUsdc = await getUsdcBalance();

        // Today's earnings
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEarnings = await prismaQuery.agentTransaction.aggregate({
          where: { type: 'EARN', createdAt: { gte: todayStart } },
          _sum: { amount: true },
        });

        const data = {
          state: latestState?.state || 'UNKNOWN',
          walletAddress,
          balanceUsdc: (Number(balanceUsdc) / 1e6).toFixed(2),
          runwayHours: latestState ? Number(latestState.runway || 0) : 0,
          monthlyBurn: latestState ? (Number(latestState.monthlyBurn) / 1e6).toFixed(2) : '0',
          todayEarnings: (Number(todayEarnings._sum.amount || 0n) / 1e6).toFixed(2),
          lastUpdated: latestState?.createdAt?.toISOString() || new Date().toISOString(),
        };

        return {
          contents: [{
            uri: 'agent://status',
            mimeType: 'application/json',
            text: JSON.stringify(data, null, 2),
          }],
        };
      } catch (error: any) {
        return {
          contents: [{
            uri: 'agent://status',
            mimeType: 'application/json',
            text: JSON.stringify({ error: error.message }),
          }],
        };
      }
    },
  );
}

// --- agent://positions ---

function registerPositionsResource(server: any): void {
  server.registerResource(
    'agentPositions',
    'agent://positions',
    {
      description: 'Current DeFi yield positions and rates across protocols',
      mimeType: 'application/json',
    },
    async () => {
      try {
        const [positions, rates] = await Promise.all([
          getAllPositions(),
          queryAllRates(),
        ]);

        const totalSupplied = positions.reduce((sum, p) => sum + p.supplied, 0n);

        const data = {
          totalSuppliedUsdc: (Number(totalSupplied) / 1e6).toFixed(2),
          positionCount: positions.length,
          positions: positions.map(p => ({
            protocol: p.protocol,
            chain: p.chain,
            suppliedUsdc: (Number(p.supplied) / 1e6).toFixed(2),
            riskScore: p.riskScore,
          })),
          rates: rates.map(r => ({
            protocol: r.protocol,
            chain: r.chain,
            apy: `${(r.apy * 100).toFixed(2)}%`,
            riskAdjustedApy: `${(r.riskAdjustedApy * 100).toFixed(2)}%`,
          })),
        };

        return {
          contents: [{
            uri: 'agent://positions',
            mimeType: 'application/json',
            text: JSON.stringify(data, null, 2),
          }],
        };
      } catch (error: any) {
        return {
          contents: [{
            uri: 'agent://positions',
            mimeType: 'application/json',
            text: JSON.stringify({ error: error.message }),
          }],
        };
      }
    },
  );
}

// --- agent://identity ---

function registerIdentityResource(server: any): void {
  server.registerResource(
    'agentIdentity',
    'agent://identity',
    {
      description: 'ERC-8004 on-chain identity and reputation score',
      mimeType: 'application/json',
    },
    async () => {
      try {
        const agentId = Number(ERC8004_AGENT_ID) || null;
        const reputation = agentId ? await getOurReputation() : null;

        const data = {
          agentId,
          registryId: agentId ? AGENT_REGISTRY_ID : null,
          identityRegistry: IDENTITY_REGISTRY,
          reputationRegistry: REPUTATION_REGISTRY,
          reputation: reputation ? {
            score: reputation.score,
            feedbackCount: reputation.feedbackCount,
          } : null,
        };

        return {
          contents: [{
            uri: 'agent://identity',
            mimeType: 'application/json',
            text: JSON.stringify(data, null, 2),
          }],
        };
      } catch (error: any) {
        return {
          contents: [{
            uri: 'agent://identity',
            mimeType: 'application/json',
            text: JSON.stringify({ error: error.message }),
          }],
        };
      }
    },
  );
}

// --- agent://config ---

function registerConfigResource(server: any): void {
  server.registerResource(
    'agentConfig',
    'agent://config',
    {
      description: 'Agent service prices, chains, and operational thresholds',
      mimeType: 'application/json',
    },
    async () => {
      const data = {
        services: {
          analyze: { priceUsdc: (SERVICE_PRICES.analyze / 1e6).toFixed(4) },
          summarize: { priceUsdc: (SERVICE_PRICES.summarize / 1e6).toFixed(4) },
          review: { priceUsdc: (SERVICE_PRICES.review / 1e6).toFixed(4) },
        },
        chains: {
          primary: PRIMARY_CHAIN,
          yield: YIELD_CHAIN,
        },
        protocols: ['x402', 't402'],
        paymentTokens: ['USDC (Base Sepolia)', 'USDT (Eth Sepolia)'],
      };

      return {
        contents: [{
          uri: 'agent://config',
          mimeType: 'application/json',
          text: JSON.stringify(data, null, 2),
        }],
      };
    },
  );
}

// --- agent://transactions/{limit} ---

function registerTransactionsResource(server: any): void {
  const template = new ResourceTemplate(
    'agent://transactions/{limit}',
    {
      list: async () => ({
        resources: [
          { uri: 'agent://transactions/10', name: 'Recent 10 transactions' },
          { uri: 'agent://transactions/25', name: 'Recent 25 transactions' },
          { uri: 'agent://transactions/50', name: 'Recent 50 transactions' },
        ],
      }),
      complete: {
        limit: async () => ['5', '10', '25', '50', '100'],
      },
    },
  );

  server.registerResource(
    'agentTransactions',
    template,
    {
      description: 'Recent agent transactions (earnings, costs, yield operations)',
      mimeType: 'application/json',
    },
    async (_uri: URL, variables: Record<string, string | string[]>) => {
      try {
        const limit = Math.min(parseInt(variables.limit as string) || 10, 100);

        const transactions = await prismaQuery.agentTransaction.findMany({
          orderBy: { createdAt: 'desc' },
          take: limit,
        });

        const data = {
          count: transactions.length,
          transactions: transactions.map((tx: any) => ({
            type: tx.type,
            amount: (Number(tx.amount) / 1e6).toFixed(4),
            token: tx.token,
            chain: tx.chain,
            description: tx.description,
            createdAt: tx.createdAt.toISOString(),
          })),
        };

        return {
          contents: [{
            uri: `agent://transactions/${limit}`,
            mimeType: 'application/json',
            text: JSON.stringify(data, null, 2),
          }],
        };
      } catch (error: any) {
        return {
          contents: [{
            uri: `agent://transactions/${variables.limit}`,
            mimeType: 'application/json',
            text: JSON.stringify({ error: error.message }),
          }],
        };
      }
    },
  );
}

// --- agent://services ---

function registerServicesResource(server: any): void {
  server.registerResource(
    'agentServices',
    'agent://services',
    {
      description: 'Full service catalog with Bazaar discovery extensions, pricing, and payment options',
      mimeType: 'application/json',
    },
    async () => {
      const discoveries = getAllDiscoveryExtensions();

      const data = {
        services: Object.entries(SERVICE_PRICES).map(([name, price]) => ({
          name,
          endpoint: `/services/${name}`,
          priceUsdc: (price / 1e6).toFixed(4),
          discovery: discoveries[`/services/${name}`] || null,
        })),
        payment: {
          protocols: ['x402', 't402'],
          chains: [CHAINS[PRIMARY_CHAIN].caip2, CHAINS[YIELD_CHAIN].caip2],
          schemes: ['exact', 'exact-legacy', 'permit2'],
          extensions: ['erc8004', 'bazaar', 'paymentId', 'siwx', 'eip2612GasSponsoring', 'erc20ApprovalGasSponsoring'],
        },
      };

      return {
        contents: [{
          uri: 'agent://services',
          mimeType: 'application/json',
          text: JSON.stringify(data, null, 2),
        }],
      };
    },
  );
}
