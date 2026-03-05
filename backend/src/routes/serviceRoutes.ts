import type { FastifyInstance, FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import { prismaQuery } from '../lib/prisma.ts';
import { analyzeData } from '../lib/services/analyze.ts';
import { summarizeText } from '../lib/services/summarize.ts';
import { reviewCode } from '../lib/services/review.ts';
import { getYieldOracleData } from '../lib/services/yield-oracle.ts';
import { getPriceData, getSupportedAssets } from '../lib/services/price-feed.ts';
import { getSwapQuote, getSwapTokens } from '../lib/services/swap-quote.ts';
import { getMarketIntelligence } from '../lib/services/market-intel.ts';
import { getHistoricalPriceData } from '../lib/services/price-history.ts';
import { SERVICE_PRICES, calculateServicePrice } from '../lib/wdk/config.ts';
import { isAgentAlive } from '../lib/agent/index.ts';
import { settlePayment, type SettlementResult } from '../lib/payment/middleware.ts';

/** Helper: log an EARN transaction + service request after settlement */
async function logEarning(
  settlement: SettlementResult,
  service: string,
  price: number,
  description: string,
  inputSize: number,
  outputSize: number,
  llmCost: bigint = 0n,
) {
  if (settlement.settled) {
    await prismaQuery.agentTransaction.create({
      data: {
        type: 'EARN',
        amount: BigInt(price),
        token: settlement.token || 'USDC',
        chain: settlement.chain || 'eip155:84532',
        txHash: settlement.txHash || undefined,
        description,
      },
    });
  }

  await prismaQuery.serviceRequest.create({
    data: {
      service,
      price: BigInt(price),
      payerAddr: settlement.payer || '',
      protocol: settlement.protocol || 'none',
      txHash: settlement.txHash || undefined,
      status: 'COMPLETED',
      inputSize,
      outputSize,
      llmCost,
    },
  });
}

/** Helper: check agent alive + settle + reject on failure */
function checkAlive(reply: FastifyReply): boolean {
  if (!isAgentAlive()) {
    reply.code(503).send({ success: false, error: { code: 'AGENT_DEAD', message: 'Agent has died. No services available.' }, data: null });
    return false;
  }
  return true;
}

async function settleOrReject(request: FastifyRequest, reply: FastifyReply): Promise<SettlementResult | null> {
  const settlement = await settlePayment(request, reply);
  if (!settlement.settled && (request as any).paymentPayload) {
    reply.code(402).send({
      success: false,
      error: { code: 'SETTLEMENT_FAILED', message: 'Payment settlement failed. Service result discarded.' },
      data: null,
    });
    return null;
  }
  return settlement;
}

export const serviceRoutes: FastifyPluginCallback = (app: FastifyInstance, _opts, done) => {
  // --- AI Text Services ---

  // Data analysis ($0.05)
  app.get('/analyze', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAlive(reply)) return;

    const { data } = request.query as { data?: string };
    if (!data) return reply.code(400).send({ success: false, error: { code: 'MISSING_DATA', message: 'Query parameter "data" is required' }, data: null });

    const dynamicPrice = calculateServicePrice('analyze', data.length);
    const result = await analyzeData(data);
    const settlement = await settleOrReject(request, reply);
    if (!settlement) return;

    await logEarning(settlement, 'analyze', dynamicPrice,
      `Served /analyze (${data.length} chars, $${(dynamicPrice / 1e6).toFixed(4)}) [settled via ${settlement.protocol}]`,
      data.length, result.analysis.length, result.llmCost);

    return reply.code(200).send({ success: true, error: null, data: { analysis: result.analysis, insights: result.insights, toolsUsed: result.toolsUsed } });
  });

  // Summarization ($0.02)
  app.get('/summarize', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAlive(reply)) return;

    const { text } = request.query as { text?: string };
    if (!text) return reply.code(400).send({ success: false, error: { code: 'MISSING_TEXT', message: 'Query parameter "text" is required' }, data: null });

    const dynamicPrice = calculateServicePrice('summarize', text.length);
    const result = await summarizeText(text);
    const settlement = await settleOrReject(request, reply);
    if (!settlement) return;

    await logEarning(settlement, 'summarize', dynamicPrice,
      `Served /summarize (${text.length} chars, $${(dynamicPrice / 1e6).toFixed(4)}) [settled via ${settlement.protocol}]`,
      text.length, result.summary.length, result.llmCost);

    return reply.code(200).send({ success: true, error: null, data: { summary: result.summary, keyPoints: result.keyPoints, toolsUsed: result.toolsUsed } });
  });

  // Code review ($0.10)
  app.get('/review', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAlive(reply)) return;

    const { code, language } = request.query as { code?: string; language?: string };
    if (!code) return reply.code(400).send({ success: false, error: { code: 'MISSING_CODE', message: 'Query parameter "code" is required' }, data: null });

    const dynamicPrice = calculateServicePrice('review', code.length);
    const result = await reviewCode(code, language || 'typescript');
    const settlement = await settleOrReject(request, reply);
    if (!settlement) return;

    await logEarning(settlement, 'review', dynamicPrice,
      `Served /review (${code.length} chars, $${(dynamicPrice / 1e6).toFixed(4)}) [settled via ${settlement.protocol}]`,
      code.length, result.review.length, result.llmCost);

    return reply.code(200).send({ success: true, error: null, data: { review: result.review, suggestions: result.suggestions, score: result.score, toolsUsed: result.toolsUsed } });
  });

  // --- DeFi Data Services (WDK-powered) ---

  // Yield Oracle ($0.01) - live on-chain APYs from Aave, Compound, Morpho
  app.get('/yield-oracle', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAlive(reply)) return;

    const result = await getYieldOracleData();
    const settlement = await settleOrReject(request, reply);
    if (!settlement) return;

    const price = SERVICE_PRICES['yield-oracle'];
    await logEarning(settlement, 'yield-oracle', price,
      `Served /yield-oracle (${result.protocolCount} protocols, $${(price / 1e6).toFixed(4)}) [settled via ${settlement.protocol}]`,
      0, JSON.stringify(result).length, 0n);

    return reply.code(200).send({ success: true, error: null, data: result });
  });

  // Price Feed ($0.005) - Bitfinex real-time pricing
  app.get('/price-feed', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAlive(reply)) return;

    const { from, to } = request.query as { from?: string; to?: string };
    if (!from) return reply.code(400).send({ success: false, error: { code: 'MISSING_PARAM', message: 'Query parameter "from" is required (e.g., BTC, ETH)' }, data: null });

    try {
      const result = await getPriceData(from, to || 'USD');
      const settlement = await settleOrReject(request, reply);
      if (!settlement) return;

      const price = SERVICE_PRICES['price-feed'];
      await logEarning(settlement, 'price-feed', price,
        `Served /price-feed ${result.pair} ($${(price / 1e6).toFixed(4)}) [settled via ${settlement.protocol}]`,
        from.length, JSON.stringify(result).length, 0n);

      return reply.code(200).send({ success: true, error: null, data: result });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: { code: 'PRICE_ERROR', message: err.message }, data: getSupportedAssets() });
    }
  });

  // Swap Quote ($0.005) - Velora DEX aggregator quote (read-only)
  app.get('/swap-quote', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAlive(reply)) return;

    const { tokenIn, tokenOut, amount } = request.query as { tokenIn?: string; tokenOut?: string; amount?: string };
    if (!tokenIn || !tokenOut || !amount) {
      return reply.code(400).send({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'Required: tokenIn, tokenOut (contract addresses), amount (base units)' },
        data: getSwapTokens(),
      });
    }

    try {
      const result = await getSwapQuote(tokenIn, tokenOut, amount);
      const settlement = await settleOrReject(request, reply);
      if (!settlement) return;

      const price = SERVICE_PRICES['swap-quote'];
      await logEarning(settlement, 'swap-quote', price,
        `Served /swap-quote ${tokenIn.slice(0, 10)}..>${tokenOut.slice(0, 10)}.. ($${(price / 1e6).toFixed(4)}) [settled via ${settlement.protocol}]`,
        0, JSON.stringify(result).length, 0n);

      return reply.code(200).send({ success: true, error: null, data: result });
    } catch (err: any) {
      return reply.code(400).send({
        success: false,
        error: { code: 'SWAP_ERROR', message: err.message },
        data: getSwapTokens(),
      });
    }
  });

  // Market Intelligence ($0.03) - AI-enhanced DeFi brief (prices + yields + Claude analysis)
  app.get('/market-intel', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAlive(reply)) return;

    const { tokens } = request.query as { tokens?: string };
    const tokenList = tokens ? tokens.split(',').map((t: string) => t.trim()) : ['BTC', 'ETH'];

    try {
      const result = await getMarketIntelligence(tokenList);
      const settlement = await settleOrReject(request, reply);
      if (!settlement) return;

      const price = SERVICE_PRICES['market-intel'];
      await logEarning(settlement, 'market-intel', price,
        `Served /market-intel (${tokenList.join(',')} $${(price / 1e6).toFixed(4)}) [settled via ${settlement.protocol}]`,
        tokenList.join(',').length, result.brief.length, result.llmCost);

      return reply.code(200).send({ success: true, error: null, data: { brief: result.brief, prices: result.prices, topYield: result.topYield } });
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: { code: 'INTEL_ERROR', message: err.message }, data: null });
    }
  });

  // Price History ($0.01) - Bitfinex historical price data with trend analysis
  app.get('/price-history', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAlive(reply)) return;

    const { from, to, days } = request.query as { from?: string; to?: string; days?: string };
    if (!from) return reply.code(400).send({ success: false, error: { code: 'MISSING_PARAM', message: 'Query parameter "from" is required (e.g., BTC, ETH)' }, data: null });

    try {
      const daysBack = days ? parseInt(days, 10) : 7;
      const result = await getHistoricalPriceData(from, to || 'USD', daysBack);
      const settlement = await settleOrReject(request, reply);
      if (!settlement) return;

      const price = SERVICE_PRICES['price-history'];
      await logEarning(settlement, 'price-history', price,
        `Served /price-history ${result.pair} ${daysBack}d ($${(price / 1e6).toFixed(4)}) [settled via ${settlement.protocol}]`,
        from.length, JSON.stringify(result).length, 0n);

      return reply.code(200).send({ success: true, error: null, data: result });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: { code: 'PRICE_HISTORY_ERROR', message: err.message }, data: null });
    }
  });

  done();
};
