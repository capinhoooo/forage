import {
  BASE_SEPOLIA_RPC,
  ARBITRUM_SEPOLIA_RPC,
  ETHEREUM_SEPOLIA_RPC,
  USDC_BASE_SEPOLIA,
  USDC_ETH_SEPOLIA_CIRCLE,
  USDC_ETH_SEPOLIA_AAVE,
  PIMLICO_BUNDLER_URL,
  ERC4337_ENTRY_POINT,
  SAFE_MODULES_VERSION,
  SPARK_NETWORK,
} from '../../config/main-config.ts';

export const CHAINS = {
  'base-sepolia': {
    provider: BASE_SEPOLIA_RPC,
    chainId: 84532,
    caip2: 'eip155:84532',
    name: 'Base Sepolia',
    explorerUrl: 'https://sepolia.basescan.org',
  },
  'ethereum-sepolia': {
    provider: ETHEREUM_SEPOLIA_RPC,
    chainId: 11155111,
    caip2: 'eip155:11155111',
    name: 'Ethereum Sepolia',
    explorerUrl: 'https://sepolia.etherscan.io',
  },
  'arbitrum-sepolia': {
    provider: ARBITRUM_SEPOLIA_RPC,
    chainId: 421614,
    caip2: 'eip155:421614',
    name: 'Arbitrum Sepolia',
    explorerUrl: 'https://sepolia.arbiscan.io',
  },
  'spark': {
    provider: '',
    chainId: 0,
    caip2: `spark:${SPARK_NETWORK.toLowerCase()}`,
    name: 'Spark (Lightning)',
    explorerUrl: 'https://scan.spark.money',
  },
} as const;

export type ChainKey = keyof typeof CHAINS;

export const PRIMARY_CHAIN: ChainKey = 'base-sepolia';
export const YIELD_CHAIN: ChainKey = 'ethereum-sepolia';
export const SPARK_CHAIN: ChainKey = 'spark';

export const TOKENS = {
  'base-sepolia': {
    USDC: {
      address: USDC_BASE_SEPOLIA,
      decimals: 6,
      symbol: 'USDC',
    },
  },
  'ethereum-sepolia': {
    USDC_CIRCLE: {
      address: USDC_ETH_SEPOLIA_CIRCLE,
      decimals: 6,
      symbol: 'USDC',
    },
    USDC_AAVE: {
      address: USDC_ETH_SEPOLIA_AAVE,
      decimals: 6,
      symbol: 'USDC',
    },
  },
  'arbitrum-sepolia': {
    USDC: {
      address: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', // Aave USDC on Arb Sepolia
      decimals: 6,
      symbol: 'USDC',
    },
  },
  'spark': {
    // Spark uses BTC (satoshis), no ERC-20 tokens
  },
} as const;

// Service base pricing in USDC base units (6 decimals)
// These are minimum prices. Actual price scales with input length (for text services).
export const SERVICE_PRICES = {
  analyze: 50_000, // $0.05 base
  summarize: 20_000, // $0.02 base
  review: 100_000, // $0.10 base
  'yield-oracle': 10_000, // $0.01 flat (DeFi data)
  'price-feed': 5_000, // $0.005 flat (Bitfinex price)
  'swap-quote': 5_000, // $0.005 flat (Velora DEX quote)
  'market-intel': 30_000, // $0.03 flat (AI-enhanced brief)
  'price-history': 10_000, // $0.01 flat (historical Bitfinex data)
} as const;

// Price per character tier (USDC base units per char above threshold)
// Tiered: base price covers first N chars, then extra cost per char
const CHAR_THRESHOLDS = {
  analyze: 200,
  summarize: 300,
  review: 500,
} as const;

const PRICE_PER_CHAR = {
  analyze: 15, // $0.000015/char above threshold
  summarize: 8, // $0.000008/char
  review: 25, // $0.000025/char (code review is expensive)
} as const;

/**
 * Calculate dynamic price based on input character count.
 * Returns price in USDC base units (6 decimals).
 */
export function calculateServicePrice(service: keyof typeof SERVICE_PRICES, inputLength: number): number {
  const base = SERVICE_PRICES[service];
  const threshold = (CHAR_THRESHOLDS as any)[service] as number | undefined;
  const perChar = (PRICE_PER_CHAR as any)[service] as number | undefined;

  // Flat-rate services (no per-char pricing)
  if (!threshold || !perChar) return base;

  if (inputLength <= threshold) return base;

  const extraChars = inputLength - threshold;
  return base + Math.ceil(extraChars * perChar);
}

// ERC-4337 config for Ethereum Sepolia (yield chain)
// Using native coins mode (Safe pays gas in ETH)
// Pimlico public endpoint requires sponsorship policy for sponsored mode
export const ERC4337_CONFIG = {
  chainId: 11155111,
  provider: ETHEREUM_SEPOLIA_RPC,
  bundlerUrl: PIMLICO_BUNDLER_URL,
  entryPointAddress: ERC4337_ENTRY_POINT,
  safeModulesVersion: SAFE_MODULES_VERSION,
  useNativeCoins: true,
  transferMaxFee: 500000000000000n, // 0.0005 ETH max gas cap
} as const;

// Aave V3 addresses per chain
export const AAVE_CONFIG = {
  'base-sepolia': {
    pool: '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27',
    poolAddressesProvider: '0xE4C23309117Aa30342BFaae6c95c6478e0A4Ad00',
    uiPoolDataProvider: '0x6a9D64f93DB660EaCB2b6E9424792c630CdA87d8',
    usdc: '0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f',
    aUsdc: '0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC',
    usdt: '0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a',
    aUsdt: '0xcE3CAae5Ed17A7AafCEEbc897DE843fA6CC0c018',
    faucet: '0xD9145b5F45Ad4519c7ACcD6E0A4A82e83bB8A6Dc',
  },
  'ethereum-sepolia': {
    pool: '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951',
    poolAddressesProvider: '0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A',
    uiPoolDataProvider: '0x69529987FA4A075D0C00B0128fa848dc71c9CDE3',
    usdc: '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8',
    aUsdc: '', // Query via getReserveData
    usdt: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
    aUsdt: '0xAF0F6e8b0Dc5c913bbF4d14c22B4E78Dd14310B6',
    faucet: '0xC959483DBa39aa9E78757139af0e9a2EDEb3f42D',
  },
} as const;

export type AaveChainKey = keyof typeof AAVE_CONFIG;

// Compound V3 (Comet) on Ethereum Sepolia
export const COMPOUND_CONFIG = {
  'ethereum-sepolia': {
    comet: '0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e',
    usdc: USDC_ETH_SEPOLIA_CIRCLE,
  },
} as const;

export type CompoundChainKey = keyof typeof COMPOUND_CONFIG;

// Morpho Blue on Ethereum Sepolia
// marketId: keccak256(loanToken, collateralToken, oracle, irm, lltv) for the target USDC market
export const MORPHO_MARKET_ID = process.env.MORPHO_MARKET_ID || '';

export const MORPHO_CONFIG = {
  'ethereum-sepolia': {
    morpho: '0xd011ee229e7459ba1ddd22631ef7bf528d424a14',
    irm: '0x8C5dDCD3F601c91D1BF51c8ec26066010ACAbA7c',
    usdc: USDC_ETH_SEPOLIA_CIRCLE,
    marketId: MORPHO_MARKET_ID,
  },
};

export type MorphoChainKey = keyof typeof MORPHO_CONFIG;

export function isAaveAvailable(chain: ChainKey = PRIMARY_CHAIN): boolean {
  return chain in AAVE_CONFIG;
}

export function isCompoundAvailable(chain: ChainKey): boolean {
  return chain in COMPOUND_CONFIG;
}

export function isMorphoAvailable(chain: ChainKey): boolean {
  return chain in MORPHO_CONFIG;
}
