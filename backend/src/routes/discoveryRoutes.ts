import type { FastifyInstance, FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import { getAllDiscoveryExtensions } from '../lib/payment/discovery.ts';
import { SERVICE_PRICES } from '../lib/wdk/config.ts';
import { ERC8004_AGENT_ID } from '../config/main-config.ts';

/**
 * Bazaar Discovery routes.
 * Exposes /.well-known/t402/discovery for agent service catalog.
 * Enables facilitators and other agents to find and understand our services.
 */
export const discoveryRoutes: FastifyPluginCallback = (app: FastifyInstance, _opts, done) => {
  // GET /.well-known/t402/discovery
  app.get('/discovery', async (_request: FastifyRequest, reply: FastifyReply) => {
    const extensions = getAllDiscoveryExtensions();

    const catalog = {
      agent: {
        name: 'Forage',
        description: 'Autonomous AI agent that earns to survive. Sells AI services via t402/x402 micropayments.',
        agentId: ERC8004_AGENT_ID || null,
        protocols: ['x402', 't402'],
      },
      services: Object.entries(extensions).map(([endpoint, ext]) => {
        const key = endpoint.split('/').pop() as keyof typeof SERVICE_PRICES;
        return {
          endpoint,
          priceUsdc: SERVICE_PRICES[key] ? (SERVICE_PRICES[key] / 1e6).toFixed(4) : null,
          discovery: ext,
        };
      }),
      capabilities: {
        paymentExtensions: [
          'erc8004',
          'bazaar',
          'paymentId',
          'siwx',
          'eip2612GasSponsoring',
          'erc20ApprovalGasSponsoring',
        ],
        chains: ['eip155:84532', 'eip155:11155111'],
        schemes: ['exact', 'exact-legacy', 'permit2'],
      },
    };

    return reply.code(200).send({
      success: true,
      error: null,
      data: catalog,
    });
  });

  // GET /.well-known/t402/services (simplified list)
  app.get('/services', async (_request: FastifyRequest, reply: FastifyReply) => {
    const services = [
      {
        path: '/services/analyze',
        method: 'GET',
        description: 'AI-powered data analysis with on-chain enrichment',
        priceUsdc: (SERVICE_PRICES.analyze / 1e6).toFixed(4),
        pricing: 'dynamic',
      },
      {
        path: '/services/summarize',
        method: 'GET',
        description: 'AI text summarization',
        priceUsdc: (SERVICE_PRICES.summarize / 1e6).toFixed(4),
        pricing: 'dynamic',
      },
      {
        path: '/services/review',
        method: 'GET',
        description: 'AI code review with smart contract verification',
        priceUsdc: (SERVICE_PRICES.review / 1e6).toFixed(4),
        pricing: 'dynamic',
      },
      {
        path: '/services/yield-oracle',
        method: 'GET',
        description: 'Live on-chain APYs from Aave, Compound, Morpho',
        priceUsdc: (SERVICE_PRICES['yield-oracle'] / 1e6).toFixed(4),
        pricing: 'flat',
      },
      {
        path: '/services/price-feed',
        method: 'GET',
        description: 'Real-time Bitfinex pricing (BTC, ETH, SOL, etc.)',
        priceUsdc: (SERVICE_PRICES['price-feed'] / 1e6).toFixed(4),
        pricing: 'flat',
      },
      {
        path: '/services/swap-quote',
        method: 'GET',
        description: 'Velora DEX aggregator swap quote (read-only)',
        priceUsdc: (SERVICE_PRICES['swap-quote'] / 1e6).toFixed(4),
        pricing: 'flat',
      },
      {
        path: '/services/market-intel',
        method: 'GET',
        description: 'AI-enhanced DeFi brief (prices + yields + Claude analysis)',
        priceUsdc: (SERVICE_PRICES['market-intel'] / 1e6).toFixed(4),
        pricing: 'flat',
      },
      {
        path: '/services/price-history',
        method: 'GET',
        description: 'Historical Bitfinex price data with trend analysis',
        priceUsdc: (SERVICE_PRICES['price-history'] / 1e6).toFixed(4),
        pricing: 'flat',
      },
    ];

    return reply.code(200).send({
      success: true,
      error: null,
      data: { services },
    });
  });

  done();
};
