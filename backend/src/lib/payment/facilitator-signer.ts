import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, sepolia } from 'viem/chains';
import { getAccount } from '../wdk/index.ts';
import { CHAINS, PRIMARY_CHAIN, type ChainKey } from '../wdk/config.ts';

const CHAIN_DEFS: Record<string, Chain> = {
  'base-sepolia': baseSepolia,
  'ethereum-sepolia': sepolia,
};

// Cache signers per chain
const signerCache = new Map<string, any>();
let facilitatorAddress: `0x${string}` | null = null;
let cachedHexKey: `0x${string}` | null = null;

/**
 * Get the WDK wallet private key as hex (cached after first call).
 */
async function getPrivateKeyHex(): Promise<`0x${string}`> {
  if (cachedHexKey) return cachedHexKey;
  const wdkAccount = await getAccount(PRIMARY_CHAIN, 0);
  const keyPair = (wdkAccount as any).keyPair;
  const privateKeyBytes: Uint8Array = keyPair.privateKey;
  cachedHexKey = `0x${Buffer.from(privateKeyBytes).toString('hex')}`;
  return cachedHexKey;
}

/**
 * Build a FacilitatorEvmSigner for a specific chain.
 * Same private key (same EOA address), different RPC + chain config.
 */
export async function buildFacilitatorEvmSignerForChain(chainKey: ChainKey) {
  const cached = signerCache.get(chainKey);
  if (cached) return cached;

  const hexKey = await getPrivateKeyHex();
  const viemAccount = privateKeyToAccount(hexKey);
  facilitatorAddress = viemAccount.address as `0x${string}`;

  const chainDef = CHAIN_DEFS[chainKey];
  if (!chainDef) throw new Error(`No viem chain definition for ${chainKey}`);

  const rpcUrl = CHAINS[chainKey].provider;

  const publicClient: PublicClient = createPublicClient({
    chain: chainDef,
    transport: http(rpcUrl),
  });

  const walletClient: WalletClient = createWalletClient({
    account: viemAccount,
    chain: chainDef,
    transport: http(rpcUrl),
  });

  const signer = {
    getAddresses: () => [facilitatorAddress!] as readonly `0x${string}`[],

    readContract: async (args: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args?: readonly unknown[] }) => {
      return publicClient.readContract({
        address: args.address,
        abi: args.abi as any,
        functionName: args.functionName,
        args: args.args as any,
      });
    },

    verifyTypedData: async (args: { address: `0x${string}`; domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown>; signature: `0x${string}` }) => {
      return publicClient.verifyTypedData({
        address: args.address,
        domain: args.domain as any,
        types: args.types as any,
        primaryType: args.primaryType,
        message: args.message as any,
        signature: args.signature,
      });
    },

    writeContract: async (args: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args: readonly unknown[] }) => {
      return walletClient.writeContract({
        address: args.address,
        abi: args.abi as any,
        functionName: args.functionName,
        args: args.args as any,
        account: viemAccount,
        chain: chainDef,
      });
    },

    sendTransaction: async (args: { to: `0x${string}`; data: `0x${string}` }) => {
      return walletClient.sendTransaction({
        to: args.to,
        data: args.data,
        account: viemAccount,
        chain: chainDef,
      });
    },

    waitForTransactionReceipt: async (args: { hash: `0x${string}` }) => {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: args.hash });
      return { status: receipt.status };
    },

    getCode: async (args: { address: `0x${string}` }) => {
      const code = await publicClient.getCode({ address: args.address });
      return code;
    },
  };

  signerCache.set(chainKey, signer);
  console.log(`[Facilitator] Built EVM signer for ${CHAINS[chainKey].name}: ${facilitatorAddress}`);
  return signer;
}

/**
 * Build the default facilitator signer (Base Sepolia, backward compatible).
 */
export async function buildFacilitatorEvmSigner() {
  return buildFacilitatorEvmSignerForChain(PRIMARY_CHAIN);
}

export function getFacilitatorAddress(): `0x${string}` | null {
  return facilitatorAddress;
}
