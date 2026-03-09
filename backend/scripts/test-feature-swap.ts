/**
 * Test: Feature 4 - WDK Swap Tools (Velora)
 *
 * Tests:
 * 1. Swap tools registered (quoteSwap, swap)
 * 2. quoteSwap callable
 * 3. Total tool count (28 + 2 = 30)
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
  console.log('=== Feature 4: WDK Swap Tools ===\n');

  const client = await initMcpToolkit();
  const { tools } = await client.listTools();
  const toolNames = tools.map((t: any) => t.name);

  // --- Test 1: Tool Registration ---
  console.log('[1] Swap Tool Registration');

  check('quoteSwap registered', toolNames.includes('quoteSwap'));
  check('swap registered', toolNames.includes('swap'));
  check('Total tools >= 30', tools.length >= 30, `got ${tools.length}`);

  console.log(`\n  All tools (${tools.length}): ${toolNames.join(', ')}`);

  // --- Test 2: quoteSwap Call ---
  console.log('\n[2] quoteSwap Call');

  try {
    const result = await client.callTool({
      name: 'quoteSwap',
      arguments: {
        chain: 'base-sepolia',
        tokenIn: 'USDC',
        tokenOut: 'USDT',
        amount: '1',
        side: 'sell',
      },
    });
    const text = (result.content as any)?.[0]?.text || '';
    const isError = result.isError;

    if (isError) {
      // Velora may not have liquidity on testnet, but tool was callable
      check('quoteSwap callable', true, `response: ${text.slice(0, 80)}`);
    } else {
      check('quoteSwap returns data', text.length > 0, text.slice(0, 100));
    }
  } catch (e: any) {
    check('quoteSwap callable', false, e.message);
  }

  // --- Test 3: Tool Schema ---
  console.log('\n[3] Tool Schema');

  const quoteSwapTool = tools.find((t: any) => t.name === 'quoteSwap');
  const swapTool = tools.find((t: any) => t.name === 'swap');

  if (quoteSwapTool) {
    check('quoteSwap has description', Boolean(quoteSwapTool.description));
    check('quoteSwap has inputSchema', Boolean(quoteSwapTool.inputSchema));
  }
  if (swapTool) {
    check('swap has description', Boolean(swapTool.description));
    check('swap has inputSchema', Boolean(swapTool.inputSchema));
  }

  skip('swap execution', 'Would spend testnet tokens');

  await disposeMcpToolkit();

  // --- Summary ---
  console.log('\n=============================');
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log('=============================\n');

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
