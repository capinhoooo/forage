import { getPricingClient } from '../wdk/index.ts';

export interface PriceHistoryResult {
  pair: string;
  points: { price: number; timestamp: string }[];
  trend: 'up' | 'down' | 'stable';
  changePercent: number;
  high: number;
  low: number;
  source: string;
  queriedAt: string;
}

const SUPPORTED_ASSETS = ['BTC', 'ETH', 'USDT', 'XAU', 'SOL', 'AVAX', 'MATIC', 'ARB', 'OP', 'BNB'];

/**
 * Get historical price data with trend analysis.
 * Uses WDK Bitfinex pricing module (hourly candles, max 365 days back, max 100 points).
 */
export async function getHistoricalPriceData(
  from: string,
  to: string = 'USD',
  daysBack: number = 7,
): Promise<PriceHistoryResult> {
  const fromUpper = from.toUpperCase();
  const toUpper = to.toUpperCase();

  if (!SUPPORTED_ASSETS.includes(fromUpper)) {
    throw new Error(`Unsupported asset: ${from}. Supported: ${SUPPORTED_ASSETS.join(', ')}`);
  }

  // Clamp to valid range
  const days = Math.max(1, Math.min(365, daysBack));

  const client = getPricingClient();
  const now = Date.now();
  const startMs = now - days * 24 * 60 * 60 * 1000;

  const results = await (client as any).getHistoricalPrice({
    from: fromUpper,
    to: toUpper,
    start: startMs,
    end: now,
  });

  if (!results || results.length === 0) {
    throw new Error(`No historical data available for ${fromUpper}/${toUpper}`);
  }

  const points = results.map((p: any) => ({
    price: p.price,
    timestamp: new Date(p.ts).toISOString(),
  }));

  // Calculate trend metrics
  const prices = results.map((p: any) => p.price);
  const firstPrice = prices[prices.length - 1]; // oldest (results are desc)
  const lastPrice = prices[0]; // newest
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const changePercent = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;

  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (changePercent > 1) trend = 'up';
  else if (changePercent < -1) trend = 'down';

  return {
    pair: `${fromUpper}/${toUpper}`,
    points,
    trend,
    changePercent: Number(changePercent.toFixed(2)),
    high,
    low,
    source: 'bitfinex',
    queriedAt: new Date().toISOString(),
  };
}
