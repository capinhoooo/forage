/**
 * Test: Feature 11 - WDK Bridge Tools
 *
 * Tests:
 * 1. BRIDGE_TOOLS available from toolkit
 * 2. Bridge tools registered in MCP server
 * 3. quoteBridge and bridge tools exist
 */
import '../dotenv.ts';
import { initMcpToolkit, disposeMcpToolkit } from '../src/lib/mcp/index.ts';

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
  console.log('=== Feature 11: WDK Bridge Tools ===\n');

  // --- Test 1: BRIDGE_TOOLS constant ---
  console.log('[1] BRIDGE_TOOLS Constant');
  const { BRIDGE_TOOLS } = await import('@tetherto/wdk-mcp-toolkit');
  check('BRIDGE_TOOLS exported', Array.isArray(BRIDGE_TOOLS));
  check('BRIDGE_TOOLS has 2 tools', BRIDGE_TOOLS.length === 2, `got ${BRIDGE_TOOLS.length}`);

  // --- Test 2: Tool Registration ---
  console.log('\n[2] Tool Registration');
  const client = await initMcpToolkit();
  const { tools } = await client.listTools();
  const toolNames = tools.map((t: any) => t.name);

  check('quoteBridge registered', toolNames.includes('quoteBridge'));
  check('bridge registered', toolNames.includes('bridge'));
  check('Total tools >= 34', tools.length >= 34, `got ${tools.length}`);

  // --- Test 3: Tool Schemas ---
  console.log('\n[3] Tool Schemas');
  const quoteBridgeTool = tools.find((t: any) => t.name === 'quoteBridge');
  const bridgeTool = tools.find((t: any) => t.name === 'bridge');

  check('quoteBridge has inputSchema', quoteBridgeTool?.inputSchema !== undefined);
  check('bridge has inputSchema', bridgeTool?.inputSchema !== undefined);
  check('quoteBridge has description', typeof quoteBridgeTool?.description === 'string');
  check('bridge has description', typeof bridgeTool?.description === 'string');

  // --- Test 4: Existing Tools Still Working ---
  console.log('\n[4] Existing Tools Intact');
  check('getAddress still registered', toolNames.includes('getAddress'));
  check('quoteSupply still registered', toolNames.includes('quoteSupply'));
  check('quoteSwap still registered', toolNames.includes('quoteSwap'));
  check('payAndFetch still registered', toolNames.includes('payAndFetch'));

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
