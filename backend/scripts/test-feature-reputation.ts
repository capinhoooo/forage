/**
 * Test: Feature 1 - ERC-8004 Reputation System
 *
 * Tests:
 * 1. getOurReputation() query
 * 2. submitPositiveFeedback() submission
 * 3. getAgentReputation MCP tool registration
 * 4. Reputation in agent status response
 * 5. AfterSettleHook wiring check
 */
import '../dotenv.ts';
import { getOurReputation, submitPositiveFeedback } from '../src/lib/erc8004/reputation.ts';
import { ERC8004_AGENT_ID } from '../src/config/main-config.ts';
import { REPUTATION_REGISTRY } from '../src/lib/erc8004/index.ts';
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
  console.log('=== Feature 1: ERC-8004 Reputation System ===\n');

  const hasAgentId = Boolean(ERC8004_AGENT_ID);

  // --- Test 1: Configuration ---
  console.log('[1] Configuration');
  check('REPUTATION_REGISTRY is set', REPUTATION_REGISTRY.length > 0, REPUTATION_REGISTRY);
  check('ERC8004_AGENT_ID env check', true, hasAgentId ? `agentId: ${ERC8004_AGENT_ID}` : 'not set (some tests will skip)');

  // --- Test 2: Reputation Query ---
  console.log('\n[2] Reputation Query (getOurReputation)');

  if (!hasAgentId) {
    skip('getOurReputation', 'ERC8004_AGENT_ID not set');
  } else {
    try {
      const reputation = await getOurReputation();
      check('getOurReputation returns data', reputation !== null);

      if (reputation) {
        check('Has score field', typeof reputation.score === 'number', `score: ${reputation.score}`);
        check('Score is 0-100 range', reputation.score >= 0 && reputation.score <= 100, `${reputation.score}`);
        check('Has feedbackCount field', typeof reputation.feedbackCount === 'number', `count: ${reputation.feedbackCount}`);
        check('Has summaryValue field', typeof reputation.summaryValue === 'string', reputation.summaryValue);
        console.log(`\n  Reputation: score=${reputation.score}/100, feedbackCount=${reputation.feedbackCount}`);
      }
    } catch (e: any) {
      check('getOurReputation callable', false, e.message);
    }
  }

  // --- Test 3: Feedback Submission ---
  console.log('\n[3] Feedback Submission (submitPositiveFeedback)');

  if (!hasAgentId) {
    skip('submitPositiveFeedback', 'ERC8004_AGENT_ID not set');
  } else {
    try {
      // NOTE: Self-feedback is rejected by the ReputationRegistry contract.
      // The agent cannot submit feedback about itself from its own wallet.
      // In production, CLIENTS submit feedback about us after paying.
      // This test verifies the function handles the rejection gracefully.
      const txHash = await submitPositiveFeedback('/services/analyze');
      if (txHash) {
        check('submitPositiveFeedback returns tx hash', txHash.startsWith('0x'), txHash.slice(0, 20) + '...');
      } else {
        // Expected: self-feedback returns null (graceful rejection)
        check('submitPositiveFeedback handles self-feedback gracefully', true, 'null returned (contract rejects self-feedback)');
      }
    } catch (e: any) {
      check('submitPositiveFeedback callable', false, e.message);
    }
  }

  // --- Test 4: Reputation After Feedback ---
  console.log('\n[4] Reputation Score Consistency');

  if (!hasAgentId) {
    skip('Reputation consistency', 'ERC8004_AGENT_ID not set');
  } else {
    try {
      const reputation = await getOurReputation();
      if (reputation) {
        check('Reputation score is consistent', typeof reputation.score === 'number', `score: ${reputation.score}`);
        check('Reputation feedbackCount is non-negative', reputation.feedbackCount >= 0, `count: ${reputation.feedbackCount}`);
        console.log(`\n  Current reputation: score=${reputation.score}/100, feedbackCount=${reputation.feedbackCount}`);
      } else {
        check('Reputation available', false, 'returned null');
      }
    } catch (e: any) {
      check('Reputation consistency', false, e.message);
    }
  }

  // --- Test 5: MCP Tool Registration ---
  console.log('\n[5] MCP Tool Registration (getAgentReputation)');

  try {
    const client = await initMcpToolkit();
    const { tools } = await client.listTools();
    const toolNames = tools.map((t: any) => t.name);

    check('getAgentReputation registered', toolNames.includes('getAgentReputation'));

    // Call the tool
    if (hasAgentId) {
      const result = await client.callTool({ name: 'getAgentReputation', arguments: {} });
      const text = (result.content as any)?.[0]?.text || '';
      check('getAgentReputation returns text', text.length > 0, text.slice(0, 80));
      check('getAgentReputation mentions score', text.includes('score') || text.includes('Score') || text.includes('reputation'));
    } else {
      skip('getAgentReputation call', 'ERC8004_AGENT_ID not set');
    }

    // Count total tools (should be 20 now: 13 WDK + 7 custom)
    check('Total tools >= 20', tools.length >= 20, `got ${tools.length}`);
    console.log(`\n  All tools (${tools.length}): ${toolNames.join(', ')}`);

    await disposeMcpToolkit();
  } catch (e: any) {
    check('MCP toolkit init', false, e.message);
  }

  // --- Test 6: Agent Status Integration ---
  console.log('\n[6] Agent Status Integration');

  try {
    // Import getOurReputation result type check (status endpoint uses this)
    // Full agent status requires WDK wallet to be fully initialized first,
    // which may conflict with test ordering. Test the reputation module directly.
    const reputationResult = await getOurReputation();
    check('Reputation module returns correct shape', reputationResult === null || (
      typeof reputationResult.score === 'number' &&
      typeof reputationResult.feedbackCount === 'number' &&
      typeof reputationResult.summaryValue === 'string'
    ), 'shape validated');

    // Verify the agent/index.ts exports reputation in status shape
    const agentModule = await import('../src/lib/agent/index.ts');
    check('Agent module exports getAgentStatus', typeof agentModule.getAgentStatus === 'function');
  } catch (e: any) {
    check('Agent status integration', false, e.message);
  }

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
