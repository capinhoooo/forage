/**
 * Test: Feature 9 - t402 SIWx (Sign-In-With-X) Extension
 *
 * Tests:
 * 1. declareSIWxExtension creates valid extension
 * 2. Extension info contains correct fields (domain, nonce, expiration)
 * 3. SIWX_EXTENSION_KEY constant
 * 4. Schema generation
 */
import {
  declareSIWxExtension,
  SIWX_EXTENSION_KEY,
} from '@t402/extensions/sign-in-with-x';

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
  console.log('=== Feature 9: t402 SIWx Extension ===\n');

  // --- Test 1: Extension key ---
  console.log('[1] Constants');
  check('SIWX_EXTENSION_KEY is "siwx"', SIWX_EXTENSION_KEY === 'siwx');

  // --- Test 2: Basic declaration ---
  console.log('\n[2] Declaration');
  const ext = declareSIWxExtension({
    resourceUri: 'http://localhost:3700/services/analyze',
    network: 'eip155:84532' as `${string}:${string}`,
    statement: 'Authenticate to Forage',
  });
  check('returns object', typeof ext === 'object');
  check('has info property', ext.info !== undefined);
  check('has schema property', ext.schema !== undefined);

  // --- Test 3: Info fields ---
  console.log('\n[3] Info Fields');
  const info = ext.info as any;
  check('domain extracted', info.domain === 'localhost:3700');
  check('uri matches', info.uri === 'http://localhost:3700/services/analyze');
  check('statement set', info.statement === 'Authenticate to Forage');
  check('version is "1"', info.version === '1');
  check('chainId is eip155:84532', info.chainId === 'eip155:84532');
  check('nonce generated', typeof info.nonce === 'string' && info.nonce.length > 0);
  check('issuedAt is ISO timestamp', typeof info.issuedAt === 'string' && info.issuedAt.includes('T'));
  check('expirationTime set', typeof info.expirationTime === 'string');
  check('resources array', Array.isArray(info.resources) && info.resources.length > 0);

  // --- Test 4: Expiration ---
  console.log('\n[4] Expiration');
  const issued = new Date(info.issuedAt).getTime();
  const expires = new Date(info.expirationTime).getTime();
  const diffMinutes = (expires - issued) / 60000;
  check('expiration is ~5 minutes after issued', diffMinutes >= 4.9 && diffMinutes <= 5.1, `${diffMinutes.toFixed(1)} min`);

  // --- Test 5: Unique nonces ---
  console.log('\n[5] Unique Nonces');
  const ext2 = declareSIWxExtension({
    resourceUri: 'http://localhost:3700/services/summarize',
    network: 'eip155:84532' as `${string}:${string}`,
  });
  check('different calls produce different nonces', info.nonce !== (ext2.info as any).nonce);

  // --- Test 6: Schema shape ---
  console.log('\n[6] Schema');
  const schema = ext.schema as any;
  check('schema is object', typeof schema === 'object');
  check('schema has type', schema.type === 'object');

  // --- Test 7: Different endpoints ---
  console.log('\n[7] Multiple Endpoints');
  const analyzeExt = declareSIWxExtension({
    resourceUri: 'http://localhost:3700/services/analyze',
    network: 'eip155:84532' as `${string}:${string}`,
    statement: 'Auth for analysis',
  });
  const reviewExt = declareSIWxExtension({
    resourceUri: 'http://localhost:3700/services/review',
    network: 'eip155:84532' as `${string}:${string}`,
    statement: 'Auth for review',
  });
  check('different URIs in info', (analyzeExt.info as any).uri !== (reviewExt.info as any).uri);
  check('different statements', (analyzeExt.info as any).statement !== (reviewExt.info as any).statement);

  console.log('\n=============================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('=============================\n');

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
