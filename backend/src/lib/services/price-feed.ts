import { getPricingClient } from '../wdk/index.ts';

export interface PriceFeedResult {
  pair: string;
  price: number;
  source: string;
  queriedAt: string;
}

const SUPPORTED_ASSETS = ['BTC', 'ETH', 'USDT', 'XAU', 'SOL', 'AVAX', 'MATIC', 'ARB', 'OP', 'BNB'];
const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'BTC', 'ETH'];

/**
 * Get current price from Tether's Bitfinex pricing infrastructure.
 * Supports major crypto assets and fiat currencies.
 */
export async function getPriceData(from: string, to: string): Promise<PriceFeedResult> {
  const fromUpper = from.toUpperCase();
  const toUpper = to.toUpperCase();

  if (!SUPPORTED_ASSETS.includes(fromUpper) && !SUPPORTED_CURRENCIES.includes(fromUpper)) {
    throw new Error(`Unsupported asset: ${from}. Supported: ${SUPPORTED_ASSETS.join(', ')}`);
  }

  const client = getPricingClient();
  const price = await (client as any).getCurrentPrice(fromUpper, toUpper);

  if (price === 0 || price == null) {
    throw new Error(`Price unavailable for ${fromUpper}/${toUpper}`);
  }

  return {
    pair: `${fromUpper}/${toUpper}`,
    price,
    source: 'bitfinex',
    queriedAt: new Date().toISOString(),
  };
}

export function getSupportedAssets(): { assets: string[]; currencies: string[] } {
  return { assets: SUPPORTED_ASSETS, currencies: SUPPORTED_CURRENCIES };
}
