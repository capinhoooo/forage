/**
 * Test: Feature 14 - Permit2 + Server Hooks + ERC-20 Approval + Batch Balances
 *
 * Tests:
 * 1. Permit2 scheme registration
 * 2. Payment lifecycle hooks (afterVerify, verifyFailure, beforeSettle, settleFailure)
 * 3. ERC-20 approval gas sponsoring extension
 * 4. Batch token balance (getTokenBalances multicall)
 * 5. Updated service catalog and discovery
 */
import fs from 'fs';
import path from 'path';

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

function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(import.meta.dirname, '..', relPath), 'utf-8');
}

async function main() {
  console.log('=== Feature 14: Permit2 + Hooks + ERC-20 Approval + Batch Balances ===\n');

  // --- Test 1: Permit2 Scheme ---
  console.log('[1] Permit2 Scheme Registration');
  const middleware = readSrc('src/lib/payment/middleware.ts');

  check('Imports registerPermit2EvmScheme', middleware.includes("import { registerPermit2EvmScheme } from '@t402/evm/permit2/server'"));
  check('Registers Permit2 on both networks', middleware.includes('registerPermit2EvmScheme(t402Server, { networks: [network, ethNetwork] })'));
  check('Permit2 in route accepts', middleware.includes("scheme: 'permit2'"));

  // Count permit2 in buildAccepts (should appear in the accepts array)
  const permit2Accepts = (middleware.match(/scheme: 'permit2'/g) || []).length;
  check('Permit2 scheme in route config', permit2Accepts >= 1, `found ${permit2Accepts}`);

  // --- Test 2: Payment Lifecycle Hooks ---
  console.log('\n[2] Payment Lifecycle Hooks');

  check('AfterVerify hook registered on t402', middleware.includes('t402Server.onAfterVerify(afterVerifyHook)'));
  check('AfterVerify hook registered on x402', middleware.includes('x402Server.onAfterVerify(afterVerifyHook)'));
  check('VerifyFailure hook registered on t402', middleware.includes('t402Server.onVerifyFailure(onVerifyFailureHook)'));
  check('VerifyFailure hook registered on x402', middleware.includes('x402Server.onVerifyFailure(onVerifyFailureHook)'));
  check('BeforeSettle hook registered on t402', middleware.includes('t402Server.onBeforeSettle(beforeSettleHook)'));
  check('BeforeSettle hook registered on x402', middleware.includes('x402Server.onBeforeSettle(beforeSettleHook)'));
  check('SettleFailure hook registered on t402', middleware.includes('t402Server.onSettleFailure(onSettleFailureHook)'));
  check('SettleFailure hook registered on x402', middleware.includes('x402Server.onSettleFailure(onSettleFailureHook)'));

  // BeforeSettle validates positive amounts
  check('BeforeSettle validates positive amount', middleware.includes("BigInt(amount) <= 0n"));
  check('BeforeSettle can abort', middleware.includes("abort: true, reason: 'Settlement amount must be positive'"));

  // --- Test 3: ERC-20 Approval Gas Sponsoring ---
  console.log('\n[3] ERC-20 Approval Gas Sponsoring Extension');

  check('Imports declareERC20ApprovalGasSponsorExtension', middleware.includes('declareERC20ApprovalGasSponsorExtension'));
  check('Imports ERC20_APPROVAL_GAS_SPONSOR_EXTENSION_KEY', middleware.includes('ERC20_APPROVAL_GAS_SPONSOR_EXTENSION_KEY'));
  check('Declares ERC-20 approval extension per route', middleware.includes('declareERC20ApprovalGasSponsorExtension({'));
  check('ERC-20 approval ext in route extensions', middleware.includes('routeExtensions[ERC20_APPROVAL_GAS_SPONSOR_EXTENSION_KEY] = erc20ApprovalExt'));

  // Both gas sponsoring types should coexist
  check('Both EIP-2612 and ERC-20 approval gas sponsoring',
    middleware.includes('EIP2612_GAS_SPONSOR_EXTENSION_KEY') &&
    middleware.includes('ERC20_APPROVAL_GAS_SPONSOR_EXTENSION_KEY'));

  // --- Test 4: Batch Token Balances ---
  console.log('\n[4] Batch Token Balance (Multicall)');

  const wdkIndex = readSrc('src/lib/wdk/index.ts');
  check('getTokenBalances function exported', wdkIndex.includes('export async function getTokenBalances'));
  check('Accepts array of addresses', wdkIndex.includes('tokenAddresses: string[]'));
  check('Returns Record<string, bigint>', wdkIndex.includes('Record<string, bigint>'));
  check('Calls account.getTokenBalances', wdkIndex.includes('account as any).getTokenBalances(tokenAddresses)'));

  // Custom tools use batch reads
  const customTools = readSrc('src/lib/mcp/custom-tools.ts');
  check('getAggregatedBalances imports getTokenBalances', customTools.includes('getTokenBalances'));
  check('Uses batch read for base-sepolia tokens', customTools.includes('getTokenBalances(baseTokenAddresses'));
  check('Includes USDt from ethereum-sepolia', customTools.includes('getUsdtBalance()'));
  check('Shows both chains in output', customTools.includes("ethereum-sepolia"));

  // --- Test 5: Updated Catalog & Discovery ---
  console.log('\n[5] Updated Service Catalog & Discovery');

  // Custom tools catalog
  check('Service catalog lists permit2 scheme', customTools.includes("'permit2'"));
  check('Service catalog lists erc20ApprovalGasSponsoring', customTools.includes("'erc20ApprovalGasSponsoring'"));

  // Resources
  const resources = readSrc('src/lib/mcp/resources.ts');
  check('Services resource lists permit2', resources.includes("'permit2'"));
  check('Services resource lists erc20ApprovalGasSponsoring', resources.includes("'erc20ApprovalGasSponsoring'"));

  // Discovery routes
  const discovery = readSrc('src/routes/discoveryRoutes.ts');
  check('Discovery lists permit2 scheme', discovery.includes("'permit2'"));
  check('Discovery lists erc20ApprovalGasSponsoring', discovery.includes("'erc20ApprovalGasSponsoring'"));

  // Count total extensions in services resource (should be 6)
  const extMatch = resources.match(/extensions: \[([^\]]+)\]/);
  if (extMatch) {
    const extCount = extMatch[1].split(',').length;
    check('Services resource has 6 extensions', extCount === 6, `got ${extCount}`);
  }

  // --- Test 6: Import Verification ---
  console.log('\n[6] Import Verification');

  // Verify the new packages can be resolved
  try {
    await import('@t402/evm/permit2/server');
    check('@t402/evm/permit2/server resolves', true);
  } catch (e: any) {
    check('@t402/evm/permit2/server resolves', false, e.message);
  }

  try {
    const ext = await import('@t402/extensions/erc20-approval-gas-sponsoring');
    check('@t402/extensions/erc20-approval-gas-sponsoring resolves', true);
    check('declareERC20ApprovalGasSponsorExtension is a function', typeof ext.declareERC20ApprovalGasSponsorExtension === 'function');
    check('ERC20_APPROVAL_GAS_SPONSOR_EXTENSION_KEY exists', typeof ext.ERC20_APPROVAL_GAS_SPONSOR_EXTENSION_KEY === 'string');
  } catch (e: any) {
    check('@t402/extensions/erc20-approval-gas-sponsoring resolves', false, e.message);
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
