/**
 * Test: Feature 8 - t402 Payment ID Extension
 *
 * Tests:
 * 1. declarePaymentIdExtension creates valid extension
 * 2. Auto-generates UUID when no id provided
 * 3. Accepts custom metadata
 * 4. Extension has info and schema
 * 5. PAYMENT_ID_EXTENSION_KEY constant
 */
import {
  declarePaymentIdExtension,
  validatePaymentId,
  PAYMENT_ID_EXTENSION_KEY,
} from '@t402/extensions/payment-id';

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
  console.log('=== Feature 8: t402 Payment ID Extension ===\n');

  // --- Test 1: Extension key ---
  console.log('[1] Constants');
  check('PAYMENT_ID_EXTENSION_KEY is "paymentId"', PAYMENT_ID_EXTENSION_KEY === 'paymentId');

  // --- Test 2: Basic declaration ---
  console.log('\n[2] Declaration');
  const ext1 = declarePaymentIdExtension();
  check('declarePaymentIdExtension returns object', typeof ext1 === 'object');
  check('has info property', ext1.info !== undefined);
  check('has schema property', ext1.schema !== undefined);
  check('info.id is auto-generated UUID', typeof ext1.info.id === 'string' && ext1.info.id.length > 0);

  // --- Test 3: With options ---
  console.log('\n[3] With Options');
  const ext2 = declarePaymentIdExtension({
    idempotencyKey: 'test-key-123',
    groupId: 'batch-1',
    metadata: { endpoint: '/services/analyze', service: 'survival-agent' },
  });
  check('info.id auto-generated', typeof ext2.info.id === 'string' && ext2.info.id.length > 0);
  check('info.idempotencyKey set', ext2.info.idempotencyKey === 'test-key-123');
  check('info.groupId set', ext2.info.groupId === 'batch-1');
  check('info.metadata set', ext2.info.metadata?.endpoint === '/services/analyze');

  // --- Test 4: Custom ID ---
  console.log('\n[4] Custom ID');
  const customId = 'my-custom-payment-id';
  const ext3 = declarePaymentIdExtension({ id: customId });
  check('custom id used', ext3.info.id === customId);

  // --- Test 5: Unique IDs ---
  console.log('\n[5] Uniqueness');
  const ext4 = declarePaymentIdExtension();
  const ext5 = declarePaymentIdExtension();
  check('each call generates unique ID', ext4.info.id !== ext5.info.id);

  // --- Test 6: Validation ---
  console.log('\n[6] Validation');
  const serverExt = declarePaymentIdExtension();
  const validPayload = { id: serverExt.info.id };
  const invalidPayload = { id: 'wrong-id' };
  check('valid payload passes', validatePaymentId(validPayload, serverExt.info) === true);
  check('invalid payload fails', validatePaymentId(invalidPayload, serverExt.info) === false);

  // --- Test 7: Schema shape ---
  console.log('\n[7] Schema');
  check('schema is object', typeof ext1.schema === 'object');
  const schema = ext1.schema as any;
  check('schema has type', schema.type === 'object');
  check('schema has required', Array.isArray(schema.required));

  console.log('\n=============================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('=============================\n');

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
