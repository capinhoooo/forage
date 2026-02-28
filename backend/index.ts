import './dotenv.ts';

import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import FastifyCors from '@fastify/cors';
import { APP_PORT } from './src/config/main-config.ts';

// Routes
import { agentRoutes } from './src/routes/agentRoutes.ts';
import { serviceRoutes } from './src/routes/serviceRoutes.ts';
import { discoveryRoutes } from './src/routes/discoveryRoutes.ts';

// Workers
import { startErrorLogCleanupWorker } from './src/workers/errorLogCleanup.ts';
import { startAgentLoopWorker } from './src/workers/agentLoop.ts';

// WDK + Payment
import { getWdk, getWalletAddress } from './src/lib/wdk/index.ts';
import { createPaymentMiddleware } from './src/lib/payment/middleware.ts';

console.log(
  '======================\n======================\nFORAGE AGENT STARTING\n======================\n======================\n'
);

const fastify = Fastify({
  logger: false,
});

fastify.register(FastifyCors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'token', 'payment-signature', 'x-payment', 'PAYMENT-SIGNATURE'],
  exposedHeaders: ['payment-required', 'payment-response', 'x-payment-response', 'PAYMENT-REQUIRED'],
});

// Workaround: @fastify/cors exposedHeaders not working with Bun, set manually
fastify.addHook('onSend', async (_request, reply) => {
  reply.header('Access-Control-Expose-Headers', 'payment-required, payment-response, x-payment-response, PAYMENT-REQUIRED');
});

// Health check endpoint
fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
  return reply.status(200).send({
    success: true,
    message: 'Forage is alive.',
    error: null,
    data: null,
  });
});

// Register agent API routes (no payment required)
fastify.register(agentRoutes, { prefix: '/agent' });

// Register paid service routes (t402/x402 payment middleware applied)
fastify.register(serviceRoutes, { prefix: '/services' });

// Register Bazaar discovery routes (agent service catalog)
fastify.register(discoveryRoutes, { prefix: '/.well-known/t402' });

const start = async (): Promise<void> => {
  try {
    // Initialize WDK wallet
    const wdk = getWdk();
    const walletAddress = await getWalletAddress();
    console.log(`[WDK] Wallet address: ${walletAddress}`);

    // Initialize t402 payment middleware on service routes
    try {
      const paymentMw = await createPaymentMiddleware();
      fastify.addHook('onRequest', async (request, reply) => {
        // Only apply payment middleware to /services/* routes
        if (request.url.startsWith('/services/')) {
          await (paymentMw as any)(request, reply);
        }
      });
      console.log('[Payment] t402 payment middleware active on /services/*');
    } catch (error) {
      console.warn('[Payment] Failed to initialize payment middleware:', error);
      console.warn('[Payment] Services will run WITHOUT payment protection (dev mode)');
    }

    // Start workers
    startErrorLogCleanupWorker();
    startAgentLoopWorker();

    await fastify.listen({
      port: APP_PORT,
      host: '0.0.0.0',
    });

    const address = fastify.server.address();
    const port = typeof address === 'object' && address ? address.port : APP_PORT;

    console.log(`\nForage running on port ${port}`);
    console.log(`Dashboard API: http://localhost:${port}/agent/status`);
    console.log(`Paid services: http://localhost:${port}/services/analyze`);
    console.log(`Wallet: ${walletAddress}`);
  } catch (error) {
    console.log('Error starting server: ', error);
    process.exit(1);
  }
};

start();
