import { getWdk, getAccount } from '../wdk/index.ts';
import { PRIMARY_CHAIN, TOKENS, type ChainKey } from '../wdk/config.ts';
import { prismaQuery } from '../prisma.ts';
import { AGENT_MAX_TX_AMOUNT } from '../../config/main-config.ts';

const MAX_TX = BigInt(AGENT_MAX_TX_AMOUNT);

export interface SwapQuoteResult {
  tokenInAmount: string;
  tokenOutAmount: string;
  fee: string;
}

export interface SwapResult {
  hash: string;
  fee: bigint;
  tokenInAmount: bigint;
  tokenOutAmount: bigint;
}

/**
 * Get a swap quote from Velora DEX aggregator.
 * Uses WDK's registered swap protocol on the primary chain.
 */
export async function quoteSwap(
  tokenIn: string,
  tokenOut: string,
  tokenInAmount: bigint,
  chain: ChainKey = PRIMARY_CHAIN,
): Promise<SwapQuoteResult | null> {
  try {
    const wdk = getWdk();
    const account = await getAccount(chain);

    const quote = await (account as any).quoteSwap({
      tokenIn,
      tokenOut,
      tokenInAmount,
    });

    return {
      tokenInAmount: quote.tokenInAmount.toString(),
      tokenOutAmount: quote.tokenOutAmount.toString(),
      fee: quote.fee?.toString() || '0',
    };
  } catch (error: any) {
    console.error(`[SwapExecutor] Quote failed: ${error.message}`);
    return null;
  }
}

/**
 * Execute a token swap via Velora DEX aggregator on the primary chain.
 * Handles approval internally (Velora SDK manages routing).
 *
 * The WDK swap protocol:
 * 1. Quotes the swap via ParaSwap aggregator
 * 2. Builds the swap transaction (with optimal routing)
 * 3. Executes via the account's sendTransaction
 */
export async function executeSwap(
  tokenIn: string,
  tokenOut: string,
  tokenInAmount: bigint,
  chain: ChainKey = PRIMARY_CHAIN,
): Promise<SwapResult | null> {
  // Guard: max transaction amount
  if (tokenInAmount > MAX_TX) {
    console.log(`[SwapExecutor] BLOCKED: Swap amount exceeds max $${Number(MAX_TX) / 1e6}. Capping.`);
    tokenInAmount = MAX_TX;
  }

  try {
    const account = await getAccount(chain);

    console.log(`[SwapExecutor] Swapping ${Number(tokenInAmount)} of ${tokenIn} for ${tokenOut} on ${chain}`);

    // Approve tokenIn for the swap protocol
    // The WDK swap protocol handles approval internally via the account
    const result = await (account as any).swap(
      { tokenIn, tokenOut, tokenInAmount },
      { swapMaxFee: 500000000000000n }, // 0.0005 ETH max fee
    );

    console.log(`[SwapExecutor] Swap tx: ${result.hash}`);

    // Log the transaction
    await prismaQuery.agentTransaction.create({
      data: {
        type: 'SWAP',
        amount: tokenInAmount,
        token: 'USDC',
        chain,
        txHash: result.hash,
        description: `Swapped ${tokenIn.slice(0, 8)}... for ${tokenOut.slice(0, 8)}... via Velora`,
        metadata: JSON.stringify({
          tokenIn,
          tokenOut,
          tokenInAmount: result.tokenInAmount.toString(),
          tokenOutAmount: result.tokenOutAmount.toString(),
          fee: result.fee.toString(),
          method: 'velora',
        }),
      },
    });

    return {
      hash: result.hash,
      fee: result.fee || 0n,
      tokenInAmount: result.tokenInAmount,
      tokenOutAmount: result.tokenOutAmount,
    };
  } catch (error: any) {
    console.error(`[SwapExecutor] Swap failed: ${error.message}`);
    return null;
  }
}
