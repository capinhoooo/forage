/**
 * Test: Feature 13 - Multi-chain MCP + Gas Sponsoring + Discovery + Custom Tools
 *
 * Tests:
 * 1. Ethereum Sepolia registered in MCP (multi-chain)
 * 2. Gas sponsoring extension API
 * 3. New custom tools (getAggregatedBalances, getServiceCatalog)
 * 4. Services resource (agent://services)
 * 5. Discovery route module
 */
import '../dotenv.ts';
import { initMcpToolkit, disposeMcpToolkit } from '../src/lib/mcp/index.ts';
import {
  declareEip2612GasSponsorExtension,
  EIP2612_GAS_SPONSOR_EXTENSION_KEY,
} from '@t402/extensions/eip2612-gas-sponsoring';

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ${PASS} ${name}${detail ? ` (${detail})` : ''}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${name}${detail ? ` (${detail})` : ''}`);
    failed++;
  }
}

async function main() {
  console.log('=== Feature 13: Multi-chain + Gas Sponsoring + Custom Tools ===\n');

  // --- Test 1: Gas Sponsoring Extension ---
  console.log('[1] EIP-2612 Gas Sponsoring Extension');
  check('EIP2612_GAS_SPONSOR_EXTENSION_KEY exists', EIP2612_GAS_SPONSOR_EXTENSION_KEY === 'eip2612GasSponsoring');

  const gasSponsor = declareEip2612GasSponsorExtension({
    sponsoredNetworks: ['eip155:84532', 'eip155:11155111'],
    maxAmount: '200000',
    sponsorAddress: '0x0000000000000000000000000000000000000001',
  });
  check('declares extension', typeof gasSponsor === 'object');
  check('has info', gasSponsor.info !== undefined);
  check('has schema', gasSponsor.schema !== undefined);
  check('info.sponsoredNetworks is array', Array.isArray((gasSponsor.info as any).sponsoredNetworks));
  check('info has 2 networks', (gasSponsor.info as any).sponsoredNetworks.length === 2);
  check('info.maxAmount set', (gasSponsor.info as any).maxAmount === '200000');

  // --- Test 2: MCP Tool Registration ---
  console.log('\n[2] MCP Tool Registration');
  const client = await initMcpToolkit();
  const { tools } = await client.listTools();
  const toolNames = tools.map((t: any) => t.name);

  check('getAggregatedBalances registered', toolNames.includes('getAggregatedBalances'));
  check('getServiceCatalog registered', toolNames.includes('getServiceCatalog'));
  check('quoteBridge registered', toolNames.includes('quoteBridge'));
  check('Total tools >= 36', tools.length >= 36, `got ${tools.length}`);

  // --- Test 3: Resources ---
  console.log('\n[3] Resources');
  const { resources } = await client.listResources();
  const resourceUris = resources.map((r: any) => r.uri);
  check('agent://services resource registered', resourceUris.includes('agent://services'));
  check('Total resources >= 5', resources.length >= 5, `got ${resources.length}`);

  // --- Test 4: Read services resource ---
  console.log('\n[4] Services Resource Content');
  const servicesResult = await client.readResource({ uri: 'agent://services' });
  const servicesContent = servicesResult?.contents?.[0];
  check('services resource returns content', servicesContent !== undefined);

  if (servicesContent) {
    const parsed = JSON.parse((servicesContent as any).text);
    check('has services array', Array.isArray(parsed.services));
    check('has 3 services', parsed.services.length === 3);
    check('has payment info', parsed.payment !== undefined);
    check('payment has protocols', Array.isArray(parsed.payment.protocols));
    check('payment has extensions', Array.isArray(parsed.payment.extensions));
    check('payment lists 5+ extensions', parsed.payment.extensions.length >= 5);
  }

  // --- Test 5: Discovery route module ---
  console.log('\n[5] Discovery Route Module');
  const discoveryModule = await import('../src/routes/discoveryRoutes.ts');
  check('discoveryRoutes exported', typeof discoveryModule.discoveryRoutes === 'function');

  // --- Test 6: Multi-chain check ---
  console.log('\n[6] Multi-chain Wallet');
  // Verify both chains are registered by checking getAddress tool and registered chains
  const baseResult = await client.callTool({ name: 'getAddress', arguments: { blockchain: 'base-sepolia' } });
  const baseContent = (baseResult as any)?.content?.[0]?.text || '';
  check('getAddress returns content for base-sepolia', baseContent.length > 0, baseContent.substring(0, 60));

  const ethResult = await client.callTool({ name: 'getAddress', arguments: { blockchain: 'ethereum-sepolia' } });
  const ethContent = (ethResult as any)?.content?.[0]?.text || '';
  check('getAddress returns content for ethereum-sepolia', ethContent.length > 0, ethContent.substring(0, 60));

  console.log(`\n  All tools (${tools.length}): ${toolNames.join(', ')}`);

  await disposeMcpToolkit();

  console.log('\n=============================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('=============================\n');

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
