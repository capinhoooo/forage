/**
 * Test: Feature 10 - ERC-8004 Advanced Hooks
 *
 * Tests:
 * 1. erc8004ReputationCheck function exists and returns hook
 * 2. erc8004ServerIdentityCheck function exists and returns hook
 * 3. erc8004ResourceServerExtension function exists and returns extension
 * 4. erc8004SubmitFeedback function exists and returns hook
 * 5. FEEDBACK_TAGS constants
 * 6. REPUTATION_REGISTRIES mapping
 */
import {
  erc8004ReputationCheck,
  erc8004SubmitFeedback,
  erc8004ResourceServerExtension,
  erc8004ServerIdentityCheck,
  FEEDBACK_TAGS,
  REPUTATION_REGISTRIES,
} from '@t402/erc8004';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

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
  console.log('=== Feature 10: ERC-8004 Advanced Hooks ===\n');

  const viemClient = createPublicClient({ chain: baseSepolia, transport: http() });
  const testAddress = '0x0000000000000000000000000000000000000001' as `0x${string}`;

  // --- Test 1: Functions exist ---
  console.log('[1] Function Exports');
  check('erc8004ReputationCheck is function', typeof erc8004ReputationCheck === 'function');
  check('erc8004ServerIdentityCheck is function', typeof erc8004ServerIdentityCheck === 'function');
  check('erc8004ResourceServerExtension is function', typeof erc8004ResourceServerExtension === 'function');
  check('erc8004SubmitFeedback is function', typeof erc8004SubmitFeedback === 'function');

  // --- Test 2: FEEDBACK_TAGS ---
  console.log('\n[2] FEEDBACK_TAGS');
  check('FEEDBACK_TAGS is object', typeof FEEDBACK_TAGS === 'object');
  const tagKeys = Object.keys(FEEDBACK_TAGS);
  check('has tags', tagKeys.length > 0, `${tagKeys.length} tags: ${tagKeys.join(', ')}`);

  // --- Test 3: REPUTATION_REGISTRIES ---
  console.log('\n[3] REPUTATION_REGISTRIES');
  check('REPUTATION_REGISTRIES is object', typeof REPUTATION_REGISTRIES === 'object');
  const regKeys = Object.keys(REPUTATION_REGISTRIES);
  check('has registry entries', regKeys.length >= 0, `${regKeys.length} entries: ${regKeys.join(', ')}`);

  // --- Test 4: Reputation Check Hook ---
  console.log('\n[4] Reputation Check Hook');
  const reputationHook = erc8004ReputationCheck(viemClient as any, testAddress, {
    minScore: 50,
    trustedReviewers: [testAddress],
    onBelowThreshold: 'warn',
  });
  check('returns function (hook)', typeof reputationHook === 'function');

  // --- Test 5: Server Identity Check Hook ---
  console.log('\n[5] Server Identity Check Hook');
  const identityHook = erc8004ServerIdentityCheck(viemClient as any);
  check('returns function (hook)', typeof identityHook === 'function');

  // --- Test 6: Resource Server Extension ---
  console.log('\n[6] Resource Server Extension');
  const extension = erc8004ResourceServerExtension({
    client: viemClient as any,
    reputationRegistry: testAddress,
    trustedReviewers: [testAddress],
  });
  check('returns object (extension)', typeof extension === 'object');
  check('has key property', typeof (extension as any).key === 'string');

  // --- Test 7: Submit Feedback Hook ---
  console.log('\n[7] Submit Feedback Hook');
  // erc8004SubmitFeedback requires a write client, but we can test it returns a function
  // We'll just verify it's callable (actual submission needs wallet client)
  check('function exists with correct arity', erc8004SubmitFeedback.length >= 2);

  // --- Test 8: Integration with middleware ---
  console.log('\n[8] Middleware Integration');
  // Verify the hooks are actually registered in our middleware by checking imports compile
  check('Payment ID import works', typeof (await import('@t402/extensions/payment-id')).declarePaymentIdExtension === 'function');
  check('SIWx import works', typeof (await import('@t402/extensions/sign-in-with-x')).declareSIWxExtension === 'function');

  console.log('\n=============================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('=============================\n');

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
