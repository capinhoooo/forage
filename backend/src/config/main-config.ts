/**
 * Centralized configuration for the application
 * All commonly used environment variables should be defined here
 */

// Validate required environment variables on startup
const requiredEnvVars: string[] = ['DATABASE_URL', 'JWT_SECRET', 'WDK_SEED'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`FATAL: Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// App Configuration
export const APP_PORT: number = Number(process.env.APP_PORT) || 3700;
export const NODE_ENV: string = process.env.NODE_ENV || 'development';
export const IS_DEV: boolean = NODE_ENV === 'development';
export const IS_PROD: boolean = NODE_ENV === 'production';

// Database
export const DATABASE_URL: string = process.env.DATABASE_URL as string;

// Authentication
export const JWT_SECRET: string = process.env.JWT_SECRET as string;
export const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';

// Error Log Configuration
export const ERROR_LOG_MAX_RECORDS: number = 10000;
export const ERROR_LOG_CLEANUP_INTERVAL: string = '0 * * * *'; // Every hour

// WDK (Wallet Development Kit)
export const WDK_SEED: string = process.env.WDK_SEED as string;

// AI
export const ANTHROPIC_API_KEY: string = process.env.ANTHROPIC_API_KEY as string;
export const GROQ_API_KEY: string = process.env.GROQ_API_KEY || '';

// RPC Providers
export const BASE_SEPOLIA_RPC: string = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';
export const ARBITRUM_SEPOLIA_RPC: string = process.env.ARBITRUM_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc';
export const ETHEREUM_SEPOLIA_RPC: string = process.env.ETHEREUM_SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';

// ERC-4337 (Account Abstraction)
export const PIMLICO_BUNDLER_URL: string = process.env.PIMLICO_BUNDLER_URL || 'https://public.pimlico.io/v2/11155111/rpc';
export const ERC4337_ENTRY_POINT: string = '0x0000000071727De22E5E9d8BAf0edAc6f37da032'; // EntryPoint v0.7
export const SAFE_MODULES_VERSION: string = '0.3.0';

// Spark (Bitcoin Lightning)
export const SPARK_NETWORK: string = process.env.SPARK_NETWORK || 'REGTEST';

// Payment Facilitators
export const T402_FACILITATOR_URL: string = process.env.T402_FACILITATOR_URL || 'https://facilitator.t402.io';
export const X402_FACILITATOR_URL: string = process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator';

// Token Addresses (Base Sepolia)
export const USDC_BASE_SEPOLIA: string = process.env.USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

// Token Addresses (Ethereum Sepolia)
export const USDC_ETH_SEPOLIA_CIRCLE: string = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
export const USDC_ETH_SEPOLIA_AAVE: string = '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8';
export const USDT_ETH_SEPOLIA: string = '0xd077a400968890eacc75cdc901f0356c943e4fdb';

// ERC-8004 On-Chain Identity
export const ERC8004_AGENT_ID: string = process.env.ERC8004_AGENT_ID || '';

// WDK Indexer API
export const WDK_INDEXER_API_KEY: string = process.env.PUBLIC_INDEXER_API_KEY || '';

// WDK SecretManager (seed encryption at rest)
export const WDK_ENCRYPTION_KEY: string = process.env.WDK_ENCRYPTION_KEY || '';

// Agent Configuration
export const AGENT_LOOP_INTERVAL: string = process.env.AGENT_LOOP_INTERVAL || '*/5 * * * *'; // Every 5 min
export const AGENT_MAX_TX_AMOUNT: number = Number(process.env.AGENT_MAX_TX_AMOUNT) || 10_000_000; // $10 USDC (6 decimals)
export const AGENT_DAILY_SPEND_LIMIT: number = Number(process.env.AGENT_DAILY_SPEND_LIMIT) || 5_000_000; // $5 USDC
export const AGENT_MONTHLY_BURN_ESTIMATE: number = Number(process.env.AGENT_MONTHLY_BURN_ESTIMATE) || 42_000_000; // $42 USDC

// Export all as default object for convenience
export default {
  APP_PORT,
  NODE_ENV,
  IS_DEV,
  IS_PROD,
  DATABASE_URL,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  ERROR_LOG_MAX_RECORDS,
  ERROR_LOG_CLEANUP_INTERVAL,
  WDK_SEED,
  ANTHROPIC_API_KEY,
  BASE_SEPOLIA_RPC,
  ARBITRUM_SEPOLIA_RPC,
  ETHEREUM_SEPOLIA_RPC,
  PIMLICO_BUNDLER_URL,
  ERC4337_ENTRY_POINT,
  SAFE_MODULES_VERSION,
  T402_FACILITATOR_URL,
  X402_FACILITATOR_URL,
  USDC_BASE_SEPOLIA,
  USDC_ETH_SEPOLIA_CIRCLE,
  USDC_ETH_SEPOLIA_AAVE,
  USDT_ETH_SEPOLIA,
  AGENT_LOOP_INTERVAL,
  AGENT_MAX_TX_AMOUNT,
  AGENT_DAILY_SPEND_LIMIT,
  AGENT_MONTHLY_BURN_ESTIMATE,
  ERC8004_AGENT_ID,
  SPARK_NETWORK,
};
