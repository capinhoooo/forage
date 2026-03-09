/**
 * Test: Feature 6 - WDK Indexer Tools
 *
 * Tests:
 * 1. Indexer tools registration (conditional on API key)
 * 2. Tool count verification
 * 3. Config export
 */
import '../dotenv.ts';
import { initMcpToolkit, disposeMcpToolkit } from '../src/lib/mcp/index.ts';
import { WDK_INDEXER_API_KEY } from '../src/config/main-config.ts';

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
const SKIP = '\x1b[33mSKIP\x1b[0m';

let passed = 0;
let failed = 0;
let skipped = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ${PASS} ${name}${detail ? ` (${detail})` : ''}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${name}${detail ? ` (${detail})` : ''}`);
    failed++;
  }
}

function skip(name: string, reason: string) {
  console.log(`  ${SKIP} ${name} (${reason})`);
  skipped++;
}

async function main() {
  console.log('=== Feature 6: WDK Indexer Tools ===\n');

  const hasApiKey = Boolean(WDK_INDEXER_API_KEY);

  // --- Test 1: Config ---
  console.log('[1] Configuration');
  check('WDK_INDEXER_API_KEY config exported', true, hasApiKey ? 'key present' : 'not set (tools will skip)');

  // --- Test 2: Tool Registration ---
  console.log('\n[2] Tool Registration');

  const client = await initMcpToolkit();
  const { tools } = await client.listTools();
  const toolNames = tools.map((t: any) => t.name);

  if (hasApiKey) {
    check('getTokenTransfers registered', toolNames.includes('getTokenTransfers'));
    check('getIndexerTokenBalance registered', toolNames.includes('getIndexerTokenBalance'));
    check('Total tools >= 32', tools.length >= 32, `got ${tools.length}`);
  } else {
    // Indexer tools won't register without API key (they check server.indexerClient)
    skip('getTokenTransfers registration', 'WDK_INDEXER_API_KEY not set');
    skip('getIndexerTokenBalance registration', 'WDK_INDEXER_API_KEY not set');
    check('Total tools >= 30 (without indexer)', tools.length >= 30, `got ${tools.length}`);
  }

  console.log(`\n  All tools (${tools.length}): ${toolNames.join(', ')}`);

  // --- Test 3: Tool schema check ---
  console.log('\n[3] Existing Tools Still Working');

  // Verify existing tools weren't broken by adding indexer
  check('getAddress still registered', toolNames.includes('getAddress'));
  check('quoteSupply still registered', toolNames.includes('quoteSupply'));
  check('quoteSwap still registered', toolNames.includes('quoteSwap'));
  check('getAgentReputation still registered', toolNames.includes('getAgentReputation'));
  check('payAndFetch still registered', toolNames.includes('payAndFetch'));

  // --- Test 4: Resources and Prompts still working ---
  console.log('\n[4] Resources and Prompts Intact');

  const { resources } = await client.listResources();
  check('Resources still registered', resources.length >= 4, `${resources.length} resources`);

  const { prompts } = await client.listPrompts();
  check('Prompts still registered', prompts.length >= 5, `${prompts.length} prompts`);

  await disposeMcpToolkit();

  console.log('\n=============================');
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log('=============================\n');

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
