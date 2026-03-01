import WDK from '@tetherto/wdk';
import WalletManagerEvm from '@tetherto/wdk-wallet-evm';
import WalletManagerEvmErc4337 from '@tetherto/wdk-wallet-evm-erc-4337';
import WalletManagerSpark from '@tetherto/wdk-wallet-spark';
import Usdt0BridgeProtocolEvm from '@tetherto/wdk-protocol-bridge-usdt0-evm';
import VeloraProtocolEvm from '@tetherto/wdk-protocol-swap-velora-evm';
import { BitfinexPricingClient } from '@tetherto/wdk-pricing-bitfinex-http';
import { T402WDK } from '@t402/wdk';
import { Wallet, JsonRpcProvider, hexlify } from 'ethers';
import { WDK_SEED, USDT_ETH_SEPOLIA, SPARK_NETWORK } from '../../config/main-config.ts';
import { CHAINS, PRIMARY_CHAIN, YIELD_CHAIN, SPARK_CHAIN, ERC4337_CONFIG, type ChainKey } from './config.ts';

/**
 * WDK Secret Manager: encrypts/decrypts seed at rest.
 * Enable by setting WDK_ENCRYPTION_KEY env var.
 * When set, seed is encrypted in memory and only decrypted for WDK initialization.
 */
let secretManager: any = null;

/**
 * Lazy-load WdkSecretManager (uses native addons via bare-crypto).
 * Only loads when WDK_ENCRYPTION_KEY is set and encryption is actually needed.
 */
async function loadSecretManagerClass(): Promise<any> {
  try {
    // @ts-ignore - CJS module without proper TS declarations
    const mod = await import('@tetherto/wdk-secret-manager');
    return (mod as any).WdkSecretManager || (mod as any).default?.WdkSecretManager || (mod as any).default || mod;
  } catch (err) {
    console.warn('[WDK] SecretManager unavailable (native addon not supported in this runtime):', String(err).slice(0, 100));
    return null;
  }
}

export async function getSecretManager(): Promise<any> {
  const encryptionKey = process.env.WDK_ENCRYPTION_KEY;
  if (!encryptionKey) return null;

  if (!secretManager) {
    const WdkSecretManager = await loadSecretManagerClass();
    if (!WdkSecretManager) return null;
    secretManager = new WdkSecretManager(encryptionKey);
    console.log('[WDK] SecretManager initialized (seed encryption enabled)');
  }
  return secretManager;
}

/**
 * Encrypt seed phrase for secure storage.
 * Returns hex-encoded encrypted buffer.
 */
export async function encryptSeed(seed: string): Promise<string> {
  const sm = await getSecretManager();
  if (!sm) throw new Error('WDK_ENCRYPTION_KEY not set or SecretManager unavailable');
  const entropy = sm.mnemonicToEntropy(seed);
  const encrypted = (sm as any).encrypt(entropy, entropy.byteLength);
  return Buffer.from(encrypted).toString('hex');
}

/**
 * Decrypt seed phrase from encrypted storage.
 * Input: hex-encoded encrypted buffer.
 */
export async function decryptSeed(encryptedHex: string): Promise<string> {
  const sm = await getSecretManager();
  if (!sm) throw new Error('WDK_ENCRYPTION_KEY not set or SecretManager unavailable');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const entropy = sm.decrypt(encrypted);
  return sm.entropyToMnemonic(entropy);
}

let wdkInstance: InstanceType<typeof WDK> | null = null;
let t402WdkInstance: T402WDK | null = null;
let pricingClient: BitfinexPricingClient | null = null;

export function getWdk(): InstanceType<typeof WDK> {
  if (wdkInstance) return wdkInstance;

  wdkInstance = new WDK(WDK_SEED);

  // Seed encryption via WdkSecretManager (PBKDF2 + XSalsa20-Poly1305)
  // Note: requires native addon (bare-crypto). Works in Node.js/Bare, not Bun.
  // When available, encrypts seed at rest for secure storage.
  if (process.env.WDK_ENCRYPTION_KEY) {
    getSecretManager().then(sm => {
      if (!sm) return;
      try {
        const entropy = sm.mnemonicToEntropy(WDK_SEED);
        const encrypted = sm.encrypt ? sm.encrypt(entropy, entropy.byteLength) : sm.generateAndEncrypt(entropy).encryptedSeed;
        const decrypted = sm.decrypt(encrypted);
        const verified = sm.entropyToMnemonic(decrypted) === WDK_SEED;
        console.log(`[WDK] SecretManager: seed encryption ${verified ? 'verified' : 'FAILED'}`);
      } catch {
        console.log('[WDK] SecretManager initialized (encryption configured)');
      }
    }).catch(() => {});
  }

  // Base Sepolia: Standard EOA wallet (payments, x402/t402)
  wdkInstance.registerWallet(PRIMARY_CHAIN, WalletManagerEvm, {
    provider: CHAINS[PRIMARY_CHAIN].provider,
  });

  // Ethereum Sepolia: ERC-4337 Smart Account (yield, DeFi)
  wdkInstance.registerWallet(YIELD_CHAIN, WalletManagerEvmErc4337 as any, ERC4337_CONFIG as any);

  // Spark: Bitcoin Lightning wallet (zero-fee transfers)
  try {
    wdkInstance.registerWallet(SPARK_CHAIN, WalletManagerSpark as any, {
      network: SPARK_NETWORK,
    });
    console.log(`[WDK] Spark wallet registered (${SPARK_NETWORK})`);
  } catch (err) {
    console.warn('[WDK] Spark wallet registration failed (non-fatal):', String(err).slice(0, 100));
  }

  // Register protocols on primary chain
  // Note: Aave/Compound/Morpho are handled directly via ethers.js
  wdkInstance.registerProtocol(PRIMARY_CHAIN, 'usdt0', Usdt0BridgeProtocolEvm, undefined);
  wdkInstance.registerProtocol(PRIMARY_CHAIN, 'swap', VeloraProtocolEvm, undefined);

  console.log(`[WDK] Initialized on ${CHAINS[PRIMARY_CHAIN].name} (EOA) + ${CHAINS[YIELD_CHAIN].name} (4337) + Spark (Lightning)`);
  return wdkInstance;
}

// T402WDK wraps the existing WDK instance for t402 payment signing,
// cross-chain balance aggregation, and compliance features.
// Uses EvmChainConfig (not string) so chainId maps correctly for testnet.
export function getT402Wdk(): T402WDK {
  if (t402WdkInstance) return t402WdkInstance;

  const wdk = getWdk();
  t402WdkInstance = T402WDK.fromWDK(wdk as any, {
    'base-sepolia': {
      provider: CHAINS[PRIMARY_CHAIN].provider,
      chainId: CHAINS[PRIMARY_CHAIN].chainId,
      network: CHAINS[PRIMARY_CHAIN].caip2,
    },
    'ethereum-sepolia': {
      provider: CHAINS[YIELD_CHAIN].provider,
      chainId: CHAINS[YIELD_CHAIN].chainId,
      network: CHAINS[YIELD_CHAIN].caip2,
    },
  });

  console.log('[T402WDK] Wrapped existing WDK instance for t402 integration');
  return t402WdkInstance;
}

export function getPricingClient(): BitfinexPricingClient {
  if (!pricingClient) {
    pricingClient = new BitfinexPricingClient();
  }
  return pricingClient;
}

export async function getAccount(chain: ChainKey = PRIMARY_CHAIN, index: number = 0) {
  const wdk = getWdk();
  return wdk.getAccount(chain, index);
}

// Get the 4337 Smart Account on yield chain
export async function get4337Account(index: number = 0) {
  const wdk = getWdk();
  return wdk.getAccount(YIELD_CHAIN, index);
}

export async function getWalletAddress(chain: ChainKey = PRIMARY_CHAIN): Promise<string> {
  const account = await getAccount(chain);
  return account.getAddress();
}

export async function get4337WalletAddress(): Promise<string> {
  const account = await get4337Account();
  return account.getAddress();
}

/**
 * Get raw EOA ethers Wallet for a chain by extracting the WDK private key.
 * This bypasses 4337 and allows direct EOA transactions on any chain.
 * Used for DeFi operations where Safe module reverts (Aave, Compound supply).
 */
let eoaWalletCache: Record<string, Wallet> = {};
export async function getEoaWallet(chain: ChainKey = PRIMARY_CHAIN): Promise<Wallet> {
  if (eoaWalletCache[chain]) return eoaWalletCache[chain];

  const account = await getAccount(PRIMARY_CHAIN);
  const pkBytes = (account as any).keyPair.privateKey;
  const privateKeyHex = hexlify(new Uint8Array(pkBytes));
  const provider = new JsonRpcProvider(CHAINS[chain].provider);
  const wallet = new Wallet(privateKeyHex, provider);

  eoaWalletCache[chain] = wallet;
  console.log(`[WDK] EOA wallet for ${chain}: ${wallet.address}`);
  return wallet;
}

/**
 * Get the EOA address on any chain (same keypair, same address across chains).
 */
export async function getEoaAddress(): Promise<string> {
  const wallet = await getEoaWallet(PRIMARY_CHAIN);
  return wallet.address;
}

export async function getEthBalance(chain: ChainKey = PRIMARY_CHAIN): Promise<bigint> {
  const account = await getAccount(chain);
  const balance = await account.getBalance();
  return BigInt(balance.toString());
}

export async function getUsdcBalance(chain: ChainKey = PRIMARY_CHAIN): Promise<bigint> {
  const { TOKENS } = await import('./config.ts');
  const chainTokens = TOKENS[chain];
  if (!chainTokens) return 0n;

  // Get the USDC address based on chain
  let usdcAddress: string | undefined;
  if ('USDC' in chainTokens) {
    usdcAddress = (chainTokens as any).USDC.address;
  } else if ('USDC_CIRCLE' in chainTokens) {
    usdcAddress = (chainTokens as any).USDC_CIRCLE.address;
  }
  if (!usdcAddress) return 0n;

  try {
    const account = await getAccount(chain);
    const balance = await (account as any).getTokenBalance(usdcAddress);
    return BigInt(balance.toString());
  } catch {
    return 0n;
  }
}

export async function getUsdtBalance(): Promise<bigint> {
  // USDt lives on Eth Sepolia, received by the EOA (same address as Base Sepolia).
  // We can't use getAccount(YIELD_CHAIN) because that returns the 4337 smart account.
  // Instead, query the EOA address directly via viem.
  try {
    const { createPublicClient, http } = await import('viem');
    const { sepolia } = await import('viem/chains');
    const eoaAddress = await getWalletAddress(PRIMARY_CHAIN); // EOA address (payment recipient)
    const publicClient = createPublicClient({ chain: sepolia, transport: http(CHAINS[YIELD_CHAIN].provider) });
    const balance = await publicClient.readContract({
      address: USDT_ETH_SEPOLIA as `0x${string}`,
      abi: [{ inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }] as const,
      functionName: 'balanceOf',
      args: [eoaAddress as `0x${string}`],
    });
    return BigInt(balance.toString());
  } catch {
    return 0n;
  }
}

/**
 * Batch-read multiple token balances in a single multicall RPC round-trip.
 * Returns a map of token address -> balance (bigint).
 */
export async function getTokenBalances(
  tokenAddresses: string[],
  chain: ChainKey = PRIMARY_CHAIN,
): Promise<Record<string, bigint>> {
  if (tokenAddresses.length === 0) return {};
  try {
    const account = await getAccount(chain);
    const result = await (account as any).getTokenBalances(tokenAddresses);
    // Convert all values to bigint
    const balances: Record<string, bigint> = {};
    for (const [addr, bal] of Object.entries(result)) {
      balances[addr] = BigInt((bal as any).toString());
    }
    return balances;
  } catch {
    // Fallback: return zeros
    const balances: Record<string, bigint> = {};
    for (const addr of tokenAddresses) balances[addr] = 0n;
    return balances;
  }
}

export async function getEthPrice(): Promise<number> {
  try {
    const client = getPricingClient();
    return await (client as any).getCurrentPrice('ETH', 'USD');
  } catch {
    return 0;
  }
}

// --- Spark (Bitcoin Lightning) helpers ---

export async function getSparkAccount(index: number = 0) {
  const wdk = getWdk();
  return wdk.getAccount(SPARK_CHAIN, index);
}

export async function getSparkAddress(): Promise<string> {
  try {
    const account = await getSparkAccount();
    return account.getAddress();
  } catch {
    return '';
  }
}

export async function getSparkBalance(): Promise<bigint> {
  try {
    const account = await getSparkAccount();
    const balance = await account.getBalance();
    return BigInt(balance.toString());
  } catch {
    return 0n;
  }
}

export function disposeWdk(): void {
  if (t402WdkInstance) {
    t402WdkInstance = null;
    console.log('[T402WDK] Disposed');
  }
  if (wdkInstance) {
    wdkInstance.dispose();
    wdkInstance = null;
    console.log('[WDK] Disposed');
  }
  if (secretManager) {
    secretManager.dispose();
    secretManager = null;
    console.log('[WDK] SecretManager disposed');
  }
}
