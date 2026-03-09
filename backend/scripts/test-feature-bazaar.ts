/**
 * Test: Feature 7 - Bazaar Discovery Extension
 *
 * Tests:
 * 1. Discovery extensions created for all 3 services
 * 2. Extensions validate successfully
 * 3. getDiscoveryExtension() returns correct data per endpoint
 * 4. getAllDiscoveryExtensions() returns all 3
 * 5. Unknown endpoints return null
 */
import {
  getDiscoveryExtension,
  getAllDiscoveryExtensions,
  validateAllDiscovery,
} from '../src/lib/payment/discovery.ts';

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
  console.log('=== Feature 7: Bazaar Discovery Extension ===\n');

  // --- Test 1: All 3 discovery extensions exist ---
  console.log('[1] Discovery Extensions Exist');

  const analyzeExt = getDiscoveryExtension('/services/analyze');
  const summarizeExt = getDiscoveryExtension('/services/summarize');
  const reviewExt = getDiscoveryExtension('/services/review');

  check('analyze discovery exists', analyzeExt !== null);
  check('summarize discovery exists', summarizeExt !== null);
  check('review discovery exists', reviewExt !== null);

  // --- Test 2: Extensions are objects with expected shape ---
  console.log('\n[2] Extension Shape');

  // declareDiscoveryExtension returns Record<string, DiscoveryExtension>
  // Each should be a non-empty object
  check('analyze is object', typeof analyzeExt === 'object' && analyzeExt !== null);
  check('summarize is object', typeof summarizeExt === 'object' && summarizeExt !== null);
  check('review is object', typeof reviewExt === 'object' && reviewExt !== null);

  // Each should have at least one key (the extension name)
  const analyzeKeys = analyzeExt ? Object.keys(analyzeExt) : [];
  const summarizeKeys = summarizeExt ? Object.keys(summarizeExt) : [];
  const reviewKeys = reviewExt ? Object.keys(reviewExt) : [];

  check('analyze has keys', analyzeKeys.length > 0, `keys: ${analyzeKeys.join(', ')}`);
  check('summarize has keys', summarizeKeys.length > 0, `keys: ${summarizeKeys.join(', ')}`);
  check('review has keys', reviewKeys.length > 0, `keys: ${reviewKeys.join(', ')}`);

  // --- Test 3: Validation ---
  console.log('\n[3] Validation');

  const allValid = validateAllDiscovery();
  check('validateAllDiscovery() returns true', allValid === true);

  // --- Test 4: getAllDiscoveryExtensions ---
  console.log('\n[4] getAllDiscoveryExtensions()');

  const allExtensions = getAllDiscoveryExtensions();
  const allKeys = Object.keys(allExtensions);

  check('returns object', typeof allExtensions === 'object');
  check('has 3 endpoints', allKeys.length === 3, `got ${allKeys.length}`);
  check('includes /services/analyze', allKeys.includes('/services/analyze'));
  check('includes /services/summarize', allKeys.includes('/services/summarize'));
  check('includes /services/review', allKeys.includes('/services/review'));

  // Verify it returns copies (not same reference)
  const allExtensions2 = getAllDiscoveryExtensions();
  check('returns new object each call', allExtensions !== allExtensions2);

  // --- Test 5: Unknown endpoints ---
  console.log('\n[5] Unknown Endpoints');

  check('unknown path returns null', getDiscoveryExtension('/unknown') === null);
  check('empty string returns null', getDiscoveryExtension('') === null);
  check('/services returns null', getDiscoveryExtension('/services') === null);

  // --- Test 6: Extension content has discovery data ---
  // declareDiscoveryExtension returns { bazaar: { info: { input, output }, schema } }
  console.log('\n[6] Extension Content');

  if (analyzeExt) {
    const bazaar = (analyzeExt as any).bazaar;
    check('analyze ext has bazaar key', bazaar !== undefined);
    check('analyze ext has info', bazaar?.info !== undefined);
    check('analyze ext has info.input', bazaar?.info?.input !== undefined);
    check('analyze ext has info.output', bazaar?.info?.output !== undefined);
    check('analyze ext has schema', bazaar?.schema !== undefined);
  }

  if (summarizeExt) {
    const bazaar = (summarizeExt as any).bazaar;
    check('summarize ext has bazaar key', bazaar !== undefined);
    check('summarize ext has info.input', bazaar?.info?.input !== undefined);
    check('summarize ext has info.output', bazaar?.info?.output !== undefined);
  }

  if (reviewExt) {
    const bazaar = (reviewExt as any).bazaar;
    check('review ext has bazaar key', bazaar !== undefined);
    check('review ext has info.input', bazaar?.info?.input !== undefined);
    check('review ext has info.output', bazaar?.info?.output !== undefined);
  }

  console.log('\n=============================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('=============================\n');

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
