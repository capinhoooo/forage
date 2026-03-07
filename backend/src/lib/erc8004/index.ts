import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import {
  identityRegistryAbi,
  reputationRegistryAbi,
  getAgentIdentity,
  getReputationSummary,
  declareERC8004Extension,
  type AgentIdentity,
  type ReputationSummary,
  type ERC8004Extension,
  type ERC8004ReadClient,
} from '@t402/erc8004';
import { getAccount } from '../wdk/index.ts';
import { CHAINS, PRIMARY_CHAIN } from '../wdk/config.ts';

// ERC-8004 contract addresses (CREATE2 deterministic, same on all testnets)
export const IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e' as const;
export const REPUTATION_REGISTRY = '0x8004B663056A597Dffe9eCcC1965A193B7388713' as const;

// Our agent's registry ID on Base Sepolia
export const AGENT_REGISTRY_ID = `eip155:${CHAINS[PRIMARY_CHAIN].chainId}:${IDENTITY_REGISTRY}` as const;

// Cached agent ID after registration
let cachedAgentId: bigint | null = null;

function getReadClient(): ERC8004ReadClient {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(CHAINS[PRIMARY_CHAIN].provider),
  });
}

async function getWriteClient() {
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

  return { publicClient, walletClient, account };
}

/**
 * Register the agent on the ERC-8004 IdentityRegistry.
 * Mints an ERC-721 NFT and sets msg.sender as agentWallet.
 * Returns the agentId.
 */
export async function registerAgent(agentURI: string): Promise<bigint> {
  const { publicClient, walletClient, account } = await getWriteClient();

  const hash = await walletClient.writeContract({
    address: IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: 'register',
    args: [agentURI, []],
  });

  console.log(`[ERC-8004] Registration tx: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status !== 'success') {
    throw new Error(`[ERC-8004] Registration tx reverted: ${hash}`);
  }

  // Parse the Transfer event (ERC-721 mint) to get the tokenId (agentId)
  // Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
  // topic[0] = Transfer sig, topic[1] = from (0x0), topic[2] = to, topic[3] = tokenId
  const transferSig = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const transferLog = receipt.logs.find(
    (log: any) =>
      log.address.toLowerCase() === IDENTITY_REGISTRY.toLowerCase() &&
      log.topics[0] === transferSig &&
      log.topics[1] === '0x0000000000000000000000000000000000000000000000000000000000000000' // from = 0x0 (mint)
  );

  if (transferLog && transferLog.topics[3]) {
    const agentId = BigInt(transferLog.topics[3]);
    cachedAgentId = agentId;
    console.log(`[ERC-8004] Agent registered with ID: ${agentId}`);
    return agentId;
  }

  throw new Error('[ERC-8004] Could not parse agentId from Transfer event');
}

/**
 * Look up our agent's identity on-chain by agentId.
 */
export async function getOurAgentIdentity(agentId: bigint): Promise<AgentIdentity> {
  const client = getReadClient();
  return getAgentIdentity(client, IDENTITY_REGISTRY, agentId, AGENT_REGISTRY_ID as any);
}

/**
 * Get reputation summary for our agent.
 * Requires at least one trusted reviewer address.
 */
export async function getOurReputationSummary(
  agentId: bigint,
  trustedReviewers: `0x${string}`[],
): Promise<ReputationSummary> {
  const client = getReadClient();
  return getReputationSummary(client, REPUTATION_REGISTRY, agentId, trustedReviewers);
}

/**
 * Build ERC-8004 extension for t402 payment routes.
 * This tells clients our on-chain agent identity so they can verify us.
 */
export function buildERC8004Extension(agentId: number, agentWallet?: string): ERC8004Extension {
  return declareERC8004Extension(agentId, AGENT_REGISTRY_ID as any, agentWallet);
}

/**
 * Set the cached agent ID (loaded from config/env).
 */
export function setAgentId(id: bigint): void {
  cachedAgentId = id;
}

/**
 * Get the cached agent ID.
 */
export function getAgentId(): bigint | null {
  return cachedAgentId;
}

/**
 * Verify an agentId exists and is owned by the expected address.
 */
export async function verifyAgentOwnership(agentId: bigint, expectedOwner: `0x${string}`): Promise<boolean> {
  const client = getReadClient() as any;

  try {
    const owner = await client.readContract({
      address: IDENTITY_REGISTRY,
      abi: identityRegistryAbi,
      functionName: 'ownerOf',
      args: [agentId],
    });
    return (owner as string).toLowerCase() === expectedOwner.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Read agentWallet directly from on-chain (bypasses SDK parsing issues).
 */
export async function getAgentWallet(agentId: bigint): Promise<string> {
  const client = getReadClient() as any;

  const wallet = await client.readContract({
    address: IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: 'getAgentWallet',
    args: [agentId],
  });
  return wallet as string;
}
