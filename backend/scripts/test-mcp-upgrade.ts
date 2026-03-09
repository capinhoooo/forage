/**
 * Test: MCP Upgrade - All custom tools + decision wiring + service enhancement
 * Tests all 6 custom tools and the upgraded MCP integration.
 */
import '../dotenv.ts';
import { initMcpToolkit, getAnthropicMcpTools, disposeMcpToolkit } from '../src/lib/mcp/index.ts';
import { executeWithTools } from '../src/lib/agent/decision-engine.ts';

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
  console.log('=== MCP Upgrade Test Suite ===\n');

  // --- Test 1: Tool Registration ---
  console.log('[1] Tool Registration (19 total expected)');
  const client = await initMcpToolkit();
  const { tools } = await client.listTools();

  check('Total tools >= 19', tools.length >= 19, `got ${tools.length}`);

  // Check WDK tools exist
  const toolNames = tools.map(t => t.name);
  check('getAddress registered', toolNames.includes('getAddress'));
  check('getBalance registered', toolNames.includes('getBalance'));
  check('getTokenBalance registered', toolNames.includes('getTokenBalance'));
  check('getCurrentPrice registered', toolNames.includes('getCurrentPrice'));
  check('transfer registered', toolNames.includes('transfer'));
  check('sendTransaction registered', toolNames.includes('sendTransaction'));

  // Check custom tools exist
  check('getAgentIdentity registered', toolNames.includes('getAgentIdentity'));
  check('verifyAgent registered', toolNames.includes('verifyAgent'));
  check('getYieldPositions registered', toolNames.includes('getYieldPositions'));
  check('supplyToAave registered', toolNames.includes('supplyToAave'));
  check('withdrawFromAave registered', toolNames.includes('withdrawFromAave'));
  check('payAndFetch registered', toolNames.includes('payAndFetch'));

  console.log(`\n  All tools: ${toolNames.join(', ')}`);

  // --- Test 2: Anthropic SDK Bridge ---
  console.log('\n[2] Anthropic SDK Bridge (mcpTools format)');
  const anthropicTools = await getAnthropicMcpTools();
  check('Anthropic tools match MCP tools', anthropicTools.length === tools.length, `${anthropicTools.length} tools`);

  // Verify tools have .run() method
  const hasRunMethod = anthropicTools.every((t: any) => typeof t.run === 'function');
  check('All tools have .run() method', hasRunMethod);

  // Check custom tools are in Anthropic format
  const anthropicNames = anthropicTools.map((t: any) => t.name);
  check('getAgentIdentity in Anthropic format', anthropicNames.includes('getAgentIdentity'));
  check('getYieldPositions in Anthropic format', anthropicNames.includes('getYieldPositions'));
  check('payAndFetch in Anthropic format', anthropicNames.includes('payAndFetch'));

  // --- Test 3: Custom Identity Tools ---
  console.log('\n[3] Custom Identity Tools');

  // getAgentIdentity (uses ERC8004_AGENT_ID from env)
  try {
    const identityResult = await client.callTool({ name: 'getAgentIdentity', arguments: {} });
    const identityText = (identityResult.content as any)?.[0]?.text || '';
    const isError = identityResult.isError;

    if (isError && identityText.includes('No agent ID')) {
      skip('getAgentIdentity', 'ERC8004_AGENT_ID not set in env');
    } else {
      check('getAgentIdentity returns data', identityText.length > 0, identityText.slice(0, 80));
      check('getAgentIdentity mentions agent', identityText.includes('Agent') || identityText.includes('agent'));
    }
  } catch (e: any) {
    check('getAgentIdentity callable', false, e.message);
  }

  // verifyAgent
  try {
    const verifyResult = await client.callTool({
      name: 'verifyAgent',
      arguments: { agentId: 1769, ownerAddress: '0x0000000000000000000000000000000000000001' },
    });
    const verifyText = (verifyResult.content as any)?.[0]?.text || '';
    check('verifyAgent returns result', verifyText.includes('VERIFIED') || verifyText.includes('NOT VERIFIED'), verifyText.slice(0, 80));
  } catch (e: any) {
    check('verifyAgent callable', false, e.message);
  }

  // --- Test 4: Custom Yield Tools ---
  console.log('\n[4] Custom Yield Tools');

  // getYieldPositions
  try {
    const yieldResult = await client.callTool({ name: 'getYieldPositions', arguments: {} });
    const yieldText = (yieldResult.content as any)?.[0]?.text || '';
    check('getYieldPositions returns data', yieldText.length > 0, yieldText.slice(0, 100));
    check('getYieldPositions mentions positions', yieldText.includes('position') || yieldText.includes('supplied'));
  } catch (e: any) {
    check('getYieldPositions callable', false, e.message);
  }

  // withdrawFromAave (with 0 amount, should return "nothing to withdraw" or succeed)
  try {
    const withdrawResult = await client.callTool({ name: 'withdrawFromAave', arguments: { amountUsdc: 0 } });
    const withdrawText = (withdrawResult.content as any)?.[0]?.text || '';
    check('withdrawFromAave callable', withdrawText.length > 0, withdrawText.slice(0, 80));
  } catch (e: any) {
    check('withdrawFromAave callable', false, e.message);
  }

  // supplyToAave - skip actual supply to avoid spending testnet tokens
  skip('supplyToAave execution', 'Would spend testnet tokens. Tool registration verified above.');

  // --- Test 5: Agent-to-Agent Tool ---
  console.log('\n[5] Agent-to-Agent Tool');

  // payAndFetch with a non-existent URL (should return error gracefully)
  try {
    const a2aResult = await client.callTool({
      name: 'payAndFetch',
      arguments: { url: 'https://httpbin.org/status/200' },
    });
    const a2aText = (a2aResult.content as any)?.[0]?.text || '';
    const isError = a2aResult.isError;

    if (isError) {
      // Network errors are acceptable in test env
      check('payAndFetch handles errors gracefully', a2aText.includes('Error'), a2aText.slice(0, 80));
    } else {
      check('payAndFetch returns response', a2aText.includes('Status:'), a2aText.slice(0, 80));
    }
  } catch (e: any) {
    check('payAndFetch callable', false, e.message);
  }

  // --- Test 6: executeWithTools (Decision Engine Wiring) ---
  console.log('\n[6] Decision Engine executeWithTools()');

  try {
    const execResult = await executeWithTools(
      'Check the wallet balance on base-sepolia using getTokenBalance for USDC. Report the balance.',
    );
    check('executeWithTools returns result', execResult.result.length > 0, execResult.result.slice(0, 80));
    check('executeWithTools made tool calls', execResult.toolCalls.length > 0, `${execResult.toolCalls.length} calls`);
    check('executeWithTools tracked tokens', execResult.inputTokens > 0, `${execResult.inputTokens} input tokens`);

    console.log(`\n  Tool calls made:`);
    for (const tc of execResult.toolCalls) {
      console.log(`    - ${tc}`);
    }
    console.log(`  Result: ${execResult.result.slice(0, 200)}`);
  } catch (e: any) {
    check('executeWithTools runs', false, e.message);
  }

  // --- Test 7: Service Enhancement (callWithTools) ---
  console.log('\n[7] Service Enhancement (tool-enhanced services)');

  try {
    // Import dynamically to test the tool-enhanced path
    const { analyzeData } = await import('../src/lib/services/analyze.ts');
    const result = await analyzeData('Bitcoin price is $60,000. Ethereum is at $3,200. Check current prices.', 'STABLE');

    check('analyzeData returns analysis', result.analysis.length > 0, `${result.analysis.length} chars`);
    check('analyzeData returns insights', result.insights.length > 0, `${result.insights.length} insights`);
    check('analyzeData returns toolsUsed', Array.isArray(result.toolsUsed), `${result.toolsUsed.length} tools used`);
    check('analyzeData tracks cost', result.llmCost > 0n, `${result.llmCost} USDC base units`);

    if (result.toolsUsed.length > 0) {
      console.log(`  Tools used by Claude: ${result.toolsUsed.join(', ')}`);
    } else {
      console.log('  No tools used (Claude chose not to use them for this input)');
    }
  } catch (e: any) {
    check('analyzeData with tools runs', false, e.message);
  }

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
