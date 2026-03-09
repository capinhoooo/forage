/**
 * Test: Feature 5 - MCP Prompts
 *
 * Tests:
 * 1. All 5 prompts registered
 * 2. Prompt execution with arguments
 * 3. Prompt response format
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
  console.log('=== Feature 5: MCP Prompts ===\n');

  const client = await initMcpToolkit();

  // --- Test 1: Prompt Registration ---
  console.log('[1] Prompt Registration');

  const { prompts } = await client.listPrompts();
  const promptNames = prompts.map((p: any) => p.name);

  check('Prompts registered', prompts.length >= 5, `got ${prompts.length}`);
  check('analyze-survival registered', promptNames.includes('analyze-survival'));
  check('yield-decision registered', promptNames.includes('yield-decision'));
  check('emergency-protocol registered', promptNames.includes('emergency-protocol'));
  check('service-pricing registered', promptNames.includes('service-pricing'));
  check('agent-introduction registered', promptNames.includes('agent-introduction'));

  console.log(`\n  Prompts: ${promptNames.join(', ')}`);

  // --- Test 2: Invoke analyze-survival ---
  console.log('\n[2] Invoke analyze-survival');

  try {
    const result = await client.getPrompt({
      name: 'analyze-survival',
      arguments: { balance: '12.50', runway: '168', state: 'STABLE' },
    });

    check('Returns messages', Array.isArray(result.messages) && result.messages.length > 0, `${result.messages.length} message(s)`);

    const msg = result.messages[0];
    check('Message has role', msg.role === 'user');
    const text = (msg.content as any)?.text || '';
    check('Message contains state', text.includes('STABLE'));
    check('Message contains balance', text.includes('12.50'));
    check('Message contains runway', text.includes('168'));
    check('Message lists actions', text.includes('HOLD') && text.includes('SUPPLY_AAVE'));
  } catch (e: any) {
    check('analyze-survival invocation', false, e.message);
  }

  // --- Test 3: Invoke yield-decision ---
  console.log('\n[3] Invoke yield-decision');

  try {
    const result = await client.getPrompt({
      name: 'yield-decision',
      arguments: { walletBalance: '20', suppliedAmount: '5', bestApy: '3.2%', monthlyBurn: '10' },
    });

    const text = (result.messages[0].content as any)?.text || '';
    check('yield-decision returns prompt', text.length > 0);
    check('Mentions wallet balance', text.includes('20'));
    check('Mentions Aave', text.includes('Aave') || text.includes('supplied'));
  } catch (e: any) {
    check('yield-decision invocation', false, e.message);
  }

  // --- Test 4: Invoke emergency-protocol ---
  console.log('\n[4] Invoke emergency-protocol');

  try {
    const result = await client.getPrompt({
      name: 'emergency-protocol',
      arguments: { balance: '0.50', burnRate: '1.20', runway: '10' },
    });

    const text = (result.messages[0].content as any)?.text || '';
    check('emergency-protocol returns prompt', text.includes('EMERGENCY'));
    check('Lists immediate actions', text.includes('Withdraw') || text.includes('withdraw'));
  } catch (e: any) {
    check('emergency-protocol invocation', false, e.message);
  }

  // --- Test 5: Invoke agent-introduction ---
  console.log('\n[5] Invoke agent-introduction');

  try {
    const result = await client.getPrompt({
      name: 'agent-introduction',
      arguments: { agentId: '1769', services: 'analyze, summarize, review' },
    });

    const msg = result.messages[0];
    check('agent-introduction has assistant role', msg.role === 'assistant');
    const text = (msg.content as any)?.text || '';
    check('Mentions agent ID', text.includes('1769'));
    check('Lists services', text.includes('analyze') && text.includes('summarize'));
  } catch (e: any) {
    check('agent-introduction invocation', false, e.message);
  }

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
