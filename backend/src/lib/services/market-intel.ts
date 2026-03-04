import Anthropic from '@anthropic-ai/sdk';
import { getPricingClient } from '../wdk/index.ts';
import { queryAllRates } from '../agent/yield-rates.ts';
import { logLlmCost } from '../agent/cost-tracker.ts';

const anthropic = new Anthropic();

export interface MarketIntelResult {
  brief: string;
  prices: Array<{ asset: string; price: number }>;
  topYield: { protocol: string; chain: string; apy: string } | null;
  llmCost: bigint;
}

/**
 * AI-enhanced DeFi market intelligence brief.
 * Combines live price data from Bitfinex + on-chain yield rates + Claude Haiku analysis.
 */
export async function getMarketIntelligence(
  tokens: string[] = ['BTC', 'ETH'],
): Promise<MarketIntelResult> {
  const client = getPricingClient();

  // Fetch prices in parallel
  const priceResults = await Promise.allSettled(
    tokens.map(async (t) => {
      const price = await (client as any).getCurrentPrice(t.toUpperCase(), 'USD');
      return { asset: t.toUpperCase(), price: price || 0 };
    }),
  );

  const prices = priceResults
    .filter((r): r is PromiseFulfilledResult<{ asset: string; price: number }> => r.status === 'fulfilled')
    .map((r) => r.value);

  // Fetch yield rates
  const rates = await queryAllRates();
  const topYield = rates.length > 0 ? rates[0] : null;

  // Build context for Claude
  const priceContext = prices.map((p) => `${p.asset}: $${p.price.toLocaleString()}`).join(', ');
  const yieldContext = rates
    .slice(0, 5)
    .map((r) => `${r.protocol} (${r.chain}, ${r.token}): ${(r.apy * 100).toFixed(2)}% APY, risk ${r.riskScore}/10`)
    .join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: 'You are a DeFi market analyst. Give a concise market intelligence brief (3-5 sentences). Focus on actionable insights for yield optimization and risk management. No disclaimers.',
    messages: [
      {
        role: 'user',
        content: `Current prices: ${priceContext}\n\nYield rates (sorted by risk-adjusted APY):\n${yieldContext}\n\nProvide a brief market intelligence summary with yield recommendations.`,
      },
    ],
  });

  const brief = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as any).text)
    .join('');

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  // Haiku pricing: $0.80/MTok input, $4.00/MTok output
  const costUsd = (inputTokens * 0.8 + outputTokens * 4.0) / 1_000_000;
  const llmCost = BigInt(Math.ceil(costUsd * 1e6));

  await logLlmCost(inputTokens, outputTokens, 'claude-haiku-4-5-20251001').catch(() => {});

  return {
    brief,
    prices,
    topYield: topYield
      ? { protocol: topYield.protocol, chain: topYield.chain, apy: `${(topYield.apy * 100).toFixed(4)}%` }
      : null,
    llmCost,
  };
}
