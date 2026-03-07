import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import {
  reputationRegistryAbi,
  submitFeedback,
  getReputationSummary,
  FEEDBACK_TAGS,
  type ReputationSummary,
  type ERC8004ReadClient,
} from '@t402/erc8004';
import { getAccount, getWalletAddress } from '../wdk/index.ts';
import { CHAINS, PRIMARY_CHAIN } from '../wdk/config.ts';
import { ERC8004_AGENT_ID } from '../../config/main-config.ts';
import { REPUTATION_REGISTRY } from './index.ts';

// Cache write client to avoid re-deriving keys every time
let cachedWriteClient: any = null;
let cachedWalletAddress: string | null = null;

/**
 * Get a viem write client compatible with ERC8004WriteClient interface.
 */
async function getWriteClient() {
  if (cachedWriteClient) return cachedWriteClient;

  const wdkAccount = await getAccount(PRIMARY_CHAIN, 0);
  const keyPair = (wdkAccount as any).keyPair;
  const privateKeyBytes: Uint8Array = keyPair.privateKey;
  const hexKey: `0x${string}` = `0x${Buffer.from(privateKeyBytes).toString('hex')}`;
  const account = privateKeyToAccount(hexKey);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(CHAINS[PRIMARY_CHAIN].provider),
  });

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(CHAINS[PRIMARY_CHAIN].provider),
  });

  // ERC8004WriteClient needs readContract + writeContract + waitForTransactionReceipt
  cachedWriteClient = {
    readContract: (args: any) => publicClient.readContract(args),
    writeContract: (args: any) => walletClient.writeContract(args),
    waitForTransactionReceipt: (args: any) => publicClient.waitForTransactionReceipt(args),
  };

  cachedWalletAddress = account.address;
  return cachedWriteClient;
}

function getReadClient(): ERC8004ReadClient {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(CHAINS[PRIMARY_CHAIN].provider),
  });
}

/**
 * Submit positive reputation feedback after a successful service payment.
 * Fire-and-forget: errors are logged but never block the caller.
 *
 * NOTE: The ReputationRegistry contract rejects self-feedback (the agent
 * cannot submit feedback about itself from its own wallet). In production,
 * feedback comes from CLIENTS who pay for services. This function submits
 * feedback for a target agent from our wallet, which works when we are the
 * client paying another agent. For our own reputation, clients submit
 * feedback about us.
 *
 * For the hackathon demo, we also support submitting feedback directly
 * to the contract using a raw giveFeedback call when the payer address
 * differs from our wallet (the payment sender is the reviewer).
 */
export async function submitPositiveFeedback(
  endpoint: string,
  txHash?: string,
): Promise<string | null> {
  const agentId = Number(ERC8004_AGENT_ID);
  if (!agentId) return null;

  try {
    const client = await getWriteClient();

    const hash = await submitFeedback(client, REPUTATION_REGISTRY, {
      agentId: BigInt(agentId),
      value: 100n,
      valueDecimals: 0,
      tag1: FEEDBACK_TAGS.PAYMENT_SUCCESS,
      tag2: FEEDBACK_TAGS.RESPONSE_TIME,
      endpoint,
      feedbackURI: '',
      feedbackHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    });

    console.log(`[Reputation] Feedback submitted for ${endpoint}: ${hash}`);
    return hash;
  } catch (error: any) {
    // Self-feedback is rejected by the contract (agent can't review itself)
    if (error.message?.includes('Self-feedback not allowed')) {
      console.log(`[Reputation] Self-feedback skipped (clients submit feedback about us)`);
      return null;
    }
    console.warn(`[Reputation] Failed to submit feedback: ${error.message}`);
    return null;
  }
}

/**
 * Get our agent's reputation summary.
 */
export async function getOurReputation(): Promise<{
  score: number;
  feedbackCount: number;
  summaryValue: string;
} | null> {
  const agentId = Number(ERC8004_AGENT_ID);
  if (!agentId) return null;

  try {
    const client = getReadClient();

    // Use our own wallet as trusted reviewer (self-submitted feedback)
    if (!cachedWalletAddress) {
      cachedWalletAddress = await getWalletAddress();
    }

    const summary = await getReputationSummary(
      client,
      REPUTATION_REGISTRY,
      BigInt(agentId),
      [cachedWalletAddress as `0x${string}`],
    );

    return {
      score: summary.normalizedScore,
      feedbackCount: Number(summary.count),
      summaryValue: summary.summaryValue.toString(),
    };
  } catch (error: any) {
    console.warn(`[Reputation] Failed to get reputation: ${error.message}`);
    return null;
  }
}

/**
 * Create an AfterSettleHook that submits positive feedback on every settlement.
 * Compatible with both t402 and x402 onAfterSettle() hook interface.
 */
export function createReputationAfterSettleHook(endpoint: string) {
  return async (context: any): Promise<void> => {
    // Fire-and-forget: don't block settlement
    submitPositiveFeedback(endpoint, context?.result?.txHash).catch(() => {});
  };
}
