import {
  declareDiscoveryExtension,
  validateDiscoveryExtension,
  type DiscoveryExtension,
} from '@t402/extensions/bazaar';

/**
 * Bazaar Discovery Extensions for our 3 paid services.
 * Declared once at startup, included in 402 PaymentRequired responses
 * so other agents can discover and understand our service endpoints.
 */

const analyzeDiscovery = declareDiscoveryExtension({
  input: { data: 'Bitcoin price is $60,000. Ethereum is at $3,200.' },
  inputSchema: {
    properties: {
      data: { type: 'string', description: 'Text or data to analyze' },
    },
    required: ['data'],
  },
  output: {
    example: {
      analysis: 'Market analysis: BTC and ETH prices indicate...',
      insights: ['BTC holding strong at $60K', 'ETH/BTC ratio stable'],
      toolsUsed: ['getCurrentPrice'],
    },
  },
});

const summarizeDiscovery = declareDiscoveryExtension({
  input: { text: 'Long article about blockchain technology...' },
  inputSchema: {
    properties: {
      text: { type: 'string', description: 'Text to summarize' },
    },
    required: ['text'],
  },
  output: {
    example: {
      summary: 'Blockchain technology enables decentralized...',
      keyPoints: ['Decentralization', 'Immutability', 'Transparency'],
      toolsUsed: [],
    },
  },
});

const reviewDiscovery = declareDiscoveryExtension({
  input: { code: 'function add(a, b) { return a + b; }', language: 'javascript' },
  inputSchema: {
    properties: {
      code: { type: 'string', description: 'Code to review' },
      language: { type: 'string', description: 'Programming language' },
    },
    required: ['code'],
  },
  output: {
    example: {
      review: 'The function is simple but lacks type annotations...',
      suggestions: ['Add TypeScript types', 'Add input validation'],
      score: 7,
      toolsUsed: [],
    },
  },
});

const yieldOracleDiscovery = declareDiscoveryExtension({
  input: {},
  inputSchema: { properties: {}, required: [] },
  output: {
    example: {
      rates: [{ protocol: 'aave-v3', chain: 'base-sepolia', token: 'USDC', apy: '3.45%', riskScore: 9, riskAdjustedApy: '3.10%' }],
      bestOpportunity: { protocol: 'aave-v3', chain: 'base-sepolia', token: 'USDC', apy: '3.45%', riskScore: 9 },
      protocolCount: 5,
    },
  },
});

const priceFeedDiscovery = declareDiscoveryExtension({
  input: { from: 'BTC', to: 'USD' },
  inputSchema: {
    properties: {
      from: { type: 'string', description: 'Asset symbol (BTC, ETH, SOL, etc.)' },
      to: { type: 'string', description: 'Quote currency (USD, EUR, BTC)' },
    },
    required: ['from'],
  },
  output: {
    example: { pair: 'BTC/USD', price: 97234.5, source: 'bitfinex' },
  },
});

const swapQuoteDiscovery = declareDiscoveryExtension({
  input: { tokenIn: '0x036CbD...', tokenOut: '0xba50Cd...', amount: '1000000' },
  inputSchema: {
    properties: {
      tokenIn: { type: 'string', description: 'Input token contract address' },
      tokenOut: { type: 'string', description: 'Output token contract address' },
      amount: { type: 'string', description: 'Amount in base units' },
    },
    required: ['tokenIn', 'tokenOut', 'amount'],
  },
  output: {
    example: { amountIn: '1000000', amountOut: '998500', fee: '1500', chain: 'base-sepolia', protocol: 'velora' },
  },
});

const marketIntelDiscovery = declareDiscoveryExtension({
  input: { tokens: 'BTC,ETH' },
  inputSchema: {
    properties: {
      tokens: { type: 'string', description: 'Comma-separated token symbols (default: BTC,ETH)' },
    },
    required: [],
  },
  output: {
    example: {
      brief: 'BTC holding strong at $97K. Aave V3 offers best risk-adjusted yield at 3.45% on Base Sepolia...',
      prices: [{ asset: 'BTC', price: 97234.5 }],
      topYield: { protocol: 'aave-v3', chain: 'base-sepolia', apy: '3.45%' },
    },
  },
});

const priceHistoryDiscovery = declareDiscoveryExtension({
  input: { from: 'BTC', to: 'USD', days: '7' },
  inputSchema: {
    properties: {
      from: { type: 'string', description: 'Asset symbol (BTC, ETH, SOL, etc.)' },
      to: { type: 'string', description: 'Quote currency (USD, EUR, BTC)' },
      days: { type: 'string', description: 'Number of days back (1-365, default 7)' },
    },
    required: ['from'],
  },
  output: {
    example: {
      pair: 'BTC/USD',
      points: [{ price: 97234.5, timestamp: '2026-03-14T00:00:00Z' }],
      trend: 'up',
      changePercent: 2.5,
      high: 98000,
      low: 95000,
      source: 'bitfinex',
    },
  },
});

// Map endpoint paths to their discovery extensions
const discoveryMap: Record<string, Record<string, any>> = {
  '/services/analyze': analyzeDiscovery,
  '/services/summarize': summarizeDiscovery,
  '/services/review': reviewDiscovery,
  '/services/yield-oracle': yieldOracleDiscovery,
  '/services/price-feed': priceFeedDiscovery,
  '/services/swap-quote': swapQuoteDiscovery,
  '/services/market-intel': marketIntelDiscovery,
  '/services/price-history': priceHistoryDiscovery,
};

/**
 * Get the Bazaar discovery extension for a service endpoint.
 * Returns the extension object to include in the 402 response.
 */
export function getDiscoveryExtension(endpoint: string): Record<string, any> | null {
  return discoveryMap[endpoint] || null;
}

/**
 * Get all discovery extensions (for agent://services resource).
 */
export function getAllDiscoveryExtensions(): Record<string, Record<string, any>> {
  return { ...discoveryMap };
}

/**
 * Validate all discovery extensions at startup.
 */
export function validateAllDiscovery(): boolean {
  let allValid = true;
  for (const [endpoint, ext] of Object.entries(discoveryMap)) {
    // declareDiscoveryExtension returns Record<string, DiscoveryExtension>
    // Extract the first value (the actual extension) for validation
    const discoveryExt = Object.values(ext)[0] as DiscoveryExtension | undefined;
    if (!discoveryExt) {
      console.warn(`[Bazaar] No discovery extension for ${endpoint}`);
      allValid = false;
      continue;
    }
    const result = validateDiscoveryExtension(discoveryExt);
    if (!result.valid) {
      console.warn(`[Bazaar] Invalid discovery for ${endpoint}:`, result.errors);
      allValid = false;
    }
  }
  if (allValid) {
    console.log(`[Bazaar] All ${Object.keys(discoveryMap).length} service discovery extensions validated`);
  }
  return allValid;
}
