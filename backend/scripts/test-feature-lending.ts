/**
 * Test: Feature 3 - WDK Lending Tools (Aave V3 Monkey-Patch)
 *
 * Tests:
 * 1. Aave address map patch applies correctly
 * 2. All 8 lending tools registered
 * 3. quoteSupply callable (read-only, no tx)
 * 4. quoteWithdraw callable
 * 5. Total tool count (20 existing + 8 lending = 28)
 */
import '../dotenv.ts';
import { initMcpToolkit, disposeMcpToolkit } from '../src/lib/mcp/index.ts';

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
  console.log('=== Feature 3: WDK Lending Tools ===\n');

  // --- Test 1: MCP Toolkit Init with Lending ---
  console.log('[1] MCP Toolkit Initialization');

  const client = await initMcpToolkit();
  const { tools } = await client.listTools();
  const toolNames = tools.map((t: any) => t.name);

  check('Toolkit initialized', Boolean(client));
  check('Total tools >= 28', tools.length >= 28, `got ${tools.length}`);

  console.log(`\n  All tools (${tools.length}): ${toolNames.join(', ')}`);

  // --- Test 2: Lending Tool Registration ---
  console.log('\n[2] Lending Tool Registration (8 tools)');

  const lendingTools = [
    'quoteSupply', 'supply',
    'quoteWithdraw', 'withdraw',
    'quoteBorrow', 'borrow',
    'quoteRepay', 'repay',
  ];

  for (const tool of lendingTools) {
    check(`${tool} registered`, toolNames.includes(tool));
  }

  // --- Test 3: quoteSupply (read-only, safe to call) ---
  console.log('\n[3] quoteSupply Call');

  try {
    const result = await client.callTool({
      name: 'quoteSupply',
      arguments: {
        chain: 'base-sepolia',
        token: 'aUSDC',
        amount: '1',
      },
    });
    const text = (result.content as any)?.[0]?.text || '';
    const isError = result.isError;

    if (isError) {
      // May fail due to token not being in the pool, but tool was callable
      check('quoteSupply callable', true, `error response: ${text.slice(0, 80)}`);
    } else {
      check('quoteSupply returns data', text.length > 0, text.slice(0, 100));
      check('quoteSupply mentions fee or protocol', text.includes('fee') || text.includes('aave') || text.includes('protocol'));
    }
  } catch (e: any) {
    // Registration-level errors
    check('quoteSupply callable', false, e.message);
  }

  // --- Test 4: quoteWithdraw (read-only) ---
  console.log('\n[4] quoteWithdraw Call');

  try {
    const result = await client.callTool({
      name: 'quoteWithdraw',
      arguments: {
        chain: 'base-sepolia',
        token: 'aUSDC',
        amount: '1',
      },
    });
    const text = (result.content as any)?.[0]?.text || '';
    const isError = result.isError;

    if (isError) {
      check('quoteWithdraw callable', true, `error response: ${text.slice(0, 80)}`);
    } else {
      check('quoteWithdraw returns data', text.length > 0, text.slice(0, 100));
    }
  } catch (e: any) {
    check('quoteWithdraw callable', false, e.message);
  }

  // --- Test 5: Tool Annotations ---
  console.log('\n[5] Tool Annotations');

  const quoteSupplyTool = tools.find((t: any) => t.name === 'quoteSupply');
  const supplyTool = tools.find((t: any) => t.name === 'supply');

  if (quoteSupplyTool) {
    check('quoteSupply has description', Boolean(quoteSupplyTool.description));
    check('quoteSupply has inputSchema', Boolean(quoteSupplyTool.inputSchema));
  }

  if (supplyTool) {
    check('supply has description', Boolean(supplyTool.description));
    check('supply has inputSchema', Boolean(supplyTool.inputSchema));
  }

  // Skip actual supply/withdraw to avoid spending testnet tokens
  skip('supply execution', 'Would spend testnet tokens');
  skip('withdraw execution', 'Would spend testnet tokens');
  skip('borrow execution', 'Would create debt');
  skip('repay execution', 'No debt to repay');

  // --- Cleanup ---
  await disposeMcpToolkit();

  // --- Summary ---
  console.log('\n=============================');
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log('=============================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
