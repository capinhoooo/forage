/**
 * Register Forage on the ERC-8004 IdentityRegistry (Base Sepolia).
 * Mints an ERC-721 agent identity NFT.
 *
 * Usage: bun run scripts/register-agent-identity.ts
 */
import '../dotenv.ts';
import { getWalletAddress } from '../src/lib/wdk/index.ts';
import { PRIMARY_CHAIN, CHAINS } from '../src/lib/wdk/config.ts';
import { ERC8004_AGENT_ID } from '../src/config/main-config.ts';
import {
  registerAgent,
  verifyAgentOwnership,
  getAgentWallet,
  IDENTITY_REGISTRY,
  AGENT_REGISTRY_ID,
} from '../src/lib/erc8004/index.ts';

const AGENT_URI = 'data:application/json,' + encodeURIComponent(JSON.stringify({
  type: 'Forage',
  name: 'Forage: The AI That Must Earn to Live',
  description: 'Autonomous AI agent that sells AI services for USDC/USDt via t402/x402, manages DeFi yield, and optimizes its own survival economics. Built with Tether WDK.',
  services: [
    {
      name: 'analyze',
      endpoint: '/services/analyze',
      skills: ['data-analysis', 'ai-inference'],
      domains: ['analytics'],
    },
    {
      name: 'summarize',
      endpoint: '/services/summarize',
      skills: ['text-summarization', 'ai-inference'],
      domains: ['nlp'],
    },
    {
      name: 'review',
      endpoint: '/services/review',
      skills: ['code-review', 'ai-inference'],
      domains: ['software-engineering'],
    },
  ],
  x402Support: true,
  active: true,
  registrations: [],
  supportedTrust: ['erc8004-identity', 'erc8004-reputation'],
}));

async function main() {
  console.log('=== ERC-8004 Agent Registration ===\n');

  const walletAddress = await getWalletAddress(PRIMARY_CHAIN);
  console.log(`Wallet: ${walletAddress}`);
  console.log(`Chain: ${CHAINS[PRIMARY_CHAIN].name} (${CHAINS[PRIMARY_CHAIN].chainId})`);
  console.log(`Registry: ${IDENTITY_REGISTRY}`);
  console.log(`Registry ID: ${AGENT_REGISTRY_ID}\n`);

  // Check if already registered via env
  if (ERC8004_AGENT_ID) {
    const agentId = BigInt(ERC8004_AGENT_ID);
    const isOwner = await verifyAgentOwnership(agentId, walletAddress as `0x${string}`);
    if (isOwner) {
      const wallet = await getAgentWallet(agentId);
      console.log(`Agent already registered with ID: ${agentId}`);
      console.log(`  Wallet: ${wallet}`);
      console.log(`  Wallet matches: ${wallet.toLowerCase() === walletAddress.toLowerCase()}`);
      return;
    }
    console.log(`ERC8004_AGENT_ID=${ERC8004_AGENT_ID} is not owned by this wallet. Re-registering...\n`);
  } else {
    console.log('No ERC8004_AGENT_ID in .env. Registering...\n');
  }

  const agentId = await registerAgent(AGENT_URI);

  console.log(`\nRegistration complete!`);
  console.log(`  Agent ID: ${agentId}`);
  console.log(`  Registry: ${AGENT_REGISTRY_ID}`);
  console.log(`  Explorer: ${CHAINS[PRIMARY_CHAIN].explorerUrl}/token/${IDENTITY_REGISTRY}?a=${agentId}`);
  console.log(`\nAdd to .env: ERC8004_AGENT_ID=${agentId}`);

  // Verify by reading back
  console.log('\nVerifying registration...');
  const wallet = await getAgentWallet(agentId);
  const isOwner = await verifyAgentOwnership(agentId, walletAddress as `0x${string}`);
  console.log(`  Owner verified: ${isOwner}`);
  console.log(`  Wallet: ${wallet}`);
  console.log(`  Wallet matches: ${wallet.toLowerCase() === walletAddress.toLowerCase()}`);

  console.log('\n=== Registration verified! ===');
}

main().catch(console.error);
