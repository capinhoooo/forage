import { getAccount } from '../wdk/index.ts';
import { PRIMARY_CHAIN } from '../wdk/config.ts';
import { USDC_BASE_SEPOLIA } from '../../config/main-config.ts';

export interface SwapQuoteResult {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  fee: string;
  chain: string;
  protocol: string;
  queriedAt: string;
}

/**
 * Get a DEX swap quote via WDK Velora (ParaSwap aggregator).
 * Read-only, no gas required. Returns best price across DEXes.
 */
export async function getSwapQuote(
  tokenIn: string,
  tokenOut: string,
  amount: string,
): Promise<SwapQuoteResult> {
  const account = await getAccount(PRIMARY_CHAIN, 0);

  // Access the swap protocol registered on this account (registered as 'swap' in wdk/index.ts)
  const swapProtocol = (account as any).getSwapProtocol('swap');
  if (!swapProtocol) {
    throw new Error('Velora swap protocol not available');
  }

  const tokenInAmount = BigInt(amount);

  const quote = await swapProtocol.quoteSwap({
    tokenIn,
    tokenOut,
    tokenInAmount,
  });

  return {
    tokenIn,
    tokenOut,
    amountIn: quote.tokenInAmount.toString(),
    amountOut: quote.tokenOutAmount.toString(),
    fee: quote.fee.toString(),
    chain: 'base-sepolia',
    protocol: 'velora',
    queriedAt: new Date().toISOString(),
  };
}

/**
 * Get available tokens for swap on Base Sepolia.
 */
export function getSwapTokens() {
  return {
    chain: 'base-sepolia',
    tokens: [
      { symbol: 'USDC', address: USDC_BASE_SEPOLIA, decimals: 6 },
    ],
    note: 'Pass token contract addresses as tokenIn/tokenOut. Amount in base units (e.g., 1000000 = 1 USDC).',
  };
}
