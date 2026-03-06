import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  WdkMcpServer,
  WALLET_READ_TOOLS,
  WALLET_WRITE_TOOLS,
  PRICING_TOOLS,
  LENDING_TOOLS,
  SWAP_TOOLS,
  BRIDGE_TOOLS,
  INDEXER_TOOLS,
  FIAT_READ_TOOLS,
} from '@tetherto/wdk-mcp-toolkit';
import WalletManagerEvm from '@tetherto/wdk-wallet-evm';
import WalletManagerSpark from '@tetherto/wdk-wallet-spark';
import AaveProtocolEvm from '@tetherto/wdk-protocol-lending-aave-evm';
import VeloraProtocolEvm from '@tetherto/wdk-protocol-swap-velora-evm';
import BridgeUsdt0Evm from '@tetherto/wdk-protocol-bridge-usdt0-evm';
import { mcpTools } from '@anthropic-ai/sdk/helpers/beta/mcp';
import { getWdk } from '../wdk/index.ts';
import { CHAINS, PRIMARY_CHAIN, YIELD_CHAIN, SPARK_CHAIN, TOKENS } from '../wdk/config.ts';
import { USDC_BASE_SEPOLIA, USDT_ETH_SEPOLIA, WDK_INDEXER_API_KEY, SPARK_NETWORK } from '../../config/main-config.ts';
import { registerCustomTools } from './custom-tools.ts';
import { registerAgentResources } from './resources.ts';
import { registerAgentPrompts } from './prompts.ts';
import { patchAaveAddressMap } from './aave-patch.ts';
import { setMcpLogServer } from './logging.ts';

let mcpClient: InstanceType<typeof Client> | null = null;
let wdkMcpServer: InstanceType<typeof WdkMcpServer> | null = null;

/**
 * Initialize the WDK MCP toolkit with in-memory transport.
 * Injects our existing WDK instance (monkey-patch) to avoid double initialization.
 * Registers testnet chains and tokens manually (DEFAULT_TOKENS only covers mainnet).
 */
export async function initMcpToolkit(): Promise<InstanceType<typeof Client>> {
  if (mcpClient) return mcpClient;

  // Ensure base WDK is initialized first
  const wdk = getWdk();

  // Create WdkMcpServer (skip useWdk, inject our WDK directly)
  wdkMcpServer = new WdkMcpServer('survival-agent-wdk', '1.0.0');

  // Monkey-patch: inject our existing WDK instance
  (wdkMcpServer as any)._wdk = wdk;

  // Enable pricing
  wdkMcpServer.usePricing();

  // Register wallets (this adds chains to the internal registry + auto-registers default tokens)
  // We must re-register through the MCP server so tools know about our chains
  wdkMcpServer.registerWallet(PRIMARY_CHAIN, WalletManagerEvm, {
    provider: CHAINS[PRIMARY_CHAIN].provider,
  });

  // Register Ethereum Sepolia wallet (multi-chain: yield + DeFi)
  wdkMcpServer.registerWallet(YIELD_CHAIN, WalletManagerEvm, {
    provider: CHAINS[YIELD_CHAIN].provider,
  });

  // Register Spark (Bitcoin Lightning) wallet
  try {
    wdkMcpServer.registerWallet(SPARK_CHAIN, WalletManagerSpark as any, {
      network: SPARK_NETWORK,
    });
    console.log('[MCP] Spark (Lightning) wallet registered');
  } catch (err) {
    console.warn('[MCP] Spark wallet registration failed (non-fatal):', String(err).slice(0, 100));
  }

  // Register testnet tokens (DEFAULT_TOKENS only covers mainnet chain names)
  wdkMcpServer.registerToken(PRIMARY_CHAIN, 'USDC', {
    address: USDC_BASE_SEPOLIA,
    decimals: 6,
  });
  wdkMcpServer.registerToken(PRIMARY_CHAIN, 'USDT', {
    address: USDT_ETH_SEPOLIA,
    decimals: 6,
  });

  // Tokens on Ethereum Sepolia
  wdkMcpServer.registerToken(YIELD_CHAIN, 'USDC', {
    address: TOKENS['ethereum-sepolia'].USDC_CIRCLE.address,
    decimals: 6,
  });

  // Patch Aave address map to include Base Sepolia (testnet not in WDK defaults)
  await patchAaveAddressMap();

  // Register Aave test USDC token for lending tools (different from Circle USDC for payments)
  const AAVE_USDC_BASE_SEPOLIA = '0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f';
  wdkMcpServer.registerToken(PRIMARY_CHAIN, 'aUSDC', {
    address: AAVE_USDC_BASE_SEPOLIA,
    decimals: 6,
  });

  // Register Aave V3 lending protocol for Base Sepolia
  // The toolkit's registerProtocol() uses `instanceof LendingProtocol` which fails
  // when npm resolves different copies of @tetherto/wdk-wallet/protocols.
  // Bypass: directly register on the internal _protocols.lending registry + WDK.
  try {
    const protocols = (wdkMcpServer as any)._protocols;
    if (!protocols.lending.has(PRIMARY_CHAIN)) {
      protocols.lending.set(PRIMARY_CHAIN, new Set());
    }
    protocols.lending.get(PRIMARY_CHAIN).add('aave');
    wdk.registerProtocol(PRIMARY_CHAIN, 'aave', AaveProtocolEvm as any, {});
    console.log('[MCP] Aave V3 lending protocol registered for', PRIMARY_CHAIN);
  } catch (error: any) {
    console.warn(`[MCP] Lending protocol registration failed: ${error.message}`);
  }

  // Register Velora swap protocol for Base Sepolia (same instanceof bypass)
  try {
    const protocols = (wdkMcpServer as any)._protocols;
    if (!protocols.swap.has(PRIMARY_CHAIN)) {
      protocols.swap.set(PRIMARY_CHAIN, new Set());
    }
    protocols.swap.get(PRIMARY_CHAIN).add('velora');
    wdk.registerProtocol(PRIMARY_CHAIN, 'velora', VeloraProtocolEvm as any, {});
    console.log('[MCP] Velora swap protocol registered for', PRIMARY_CHAIN);
  } catch (error: any) {
    console.warn(`[MCP] Swap protocol registration failed: ${error.message}`);
  }

  // Register USDT0 bridge protocol for Base Sepolia (same instanceof bypass)
  try {
    const protocols = (wdkMcpServer as any)._protocols;
    if (!protocols.bridge.has(PRIMARY_CHAIN)) {
      protocols.bridge.set(PRIMARY_CHAIN, new Set());
    }
    protocols.bridge.get(PRIMARY_CHAIN).add('usdt0');
    wdk.registerProtocol(PRIMARY_CHAIN, 'usdt0', BridgeUsdt0Evm as any, {});
    console.log('[MCP] USDT0 bridge protocol registered for', PRIMARY_CHAIN);
  } catch (error: any) {
    console.warn(`[MCP] Bridge protocol registration failed: ${error.message}`);
  }

  // Initialize indexer if API key is available
  if (WDK_INDEXER_API_KEY) {
    try {
      wdkMcpServer.useIndexer({ apiKey: WDK_INDEXER_API_KEY });
      console.log('[MCP] WDK Indexer initialized');
    } catch (error: any) {
      console.warn(`[MCP] Indexer initialization failed: ${error.message}`);
    }
  }

  // Fiat on-ramp tools (read-only: quotes, supported assets/currencies/countries)
  console.log('[MCP] Fiat on-ramp read tools enabled (quoteBuy, quoteSell, supported assets)');

  // Register all tools: wallet + pricing + lending + swap + indexer + fiat
  wdkMcpServer.registerTools([
    ...WALLET_READ_TOOLS,   // getAddress, getBalance, getTokenBalance, getFeeRates, etc.
    ...WALLET_WRITE_TOOLS,  // sendTransaction, transfer, sign, verify
    ...PRICING_TOOLS,       // getCurrentPrice, getHistoricalPrice
    ...LENDING_TOOLS,       // quoteSupply, supply, quoteWithdraw, withdraw, quoteBorrow, borrow, quoteRepay, repay
    ...SWAP_TOOLS,          // quoteSwap, swap
    ...BRIDGE_TOOLS,        // quoteBridge, bridge (USDT0 via LayerZero)
    ...INDEXER_TOOLS,       // getTokenTransfers, getIndexerTokenBalance (requires indexer API key)
    ...FIAT_READ_TOOLS,     // quoteBuy, quoteSell, getSupportedAssets, getSupportedCurrencies, getSupportedCountries
  ]);

  // Register custom Forage tools (identity, yield, agent-to-agent)
  registerCustomTools(wdkMcpServer);

  // Register MCP resources (agent state exposed as readable URIs)
  registerAgentResources(wdkMcpServer);

  // Register MCP prompts (reusable decision templates)
  registerAgentPrompts(wdkMcpServer);

  // Set up MCP structured logging
  setMcpLogServer(wdkMcpServer);

  // Create in-memory transport pair
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  // Connect server side
  await wdkMcpServer.connect(serverTransport);

  // Connect client side with elicitation support (for write tool confirmations)
  mcpClient = new Client(
    { name: 'survival-agent-client', version: '1.0.0' },
    { capabilities: { sampling: {}, elicitation: {} } },
  );

  // Auto-approve elicitation requests (autonomous agent, no human in the loop)
  mcpClient.setRequestHandler(
    ElicitRequestSchema,
    async () => ({ action: 'accept' as const, content: { confirmed: 'true' } }),
  );

  await mcpClient.connect(clientTransport);

  const { tools } = await mcpClient.listTools();
  console.log(`[MCP] WDK toolkit initialized with ${tools.length} tools via InMemoryTransport`);
  console.log(`[MCP] Tools: ${tools.map(t => t.name).join(', ')}`);

  return mcpClient;
}

/**
 * Get MCP tools formatted for Anthropic SDK's toolRunner / messages API.
 * These can be passed directly to `tools:` in anthropic.messages.create() or toolRunner().
 */
export async function getAnthropicMcpTools() {
  const client = await initMcpToolkit();
  const { tools } = await client.listTools();
  return mcpTools(tools, client as any);
}

/**
 * Get the raw MCP client for direct tool calls.
 */
export function getMcpClient(): InstanceType<typeof Client> | null {
  return mcpClient;
}

/**
 * Dispose MCP toolkit.
 */
export async function disposeMcpToolkit(): Promise<void> {
  if (wdkMcpServer) {
    await wdkMcpServer.close();
    wdkMcpServer = null;
  }
  if (mcpClient) {
    await mcpClient.close();
    mcpClient = null;
  }
  console.log('[MCP] Toolkit disposed');
}
