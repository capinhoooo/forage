/**
 * Test: MATTERS.md Critical Fixes Verification
 *
 * Tests:
 * 1. toolRunner-based execution (decision-engine.ts)
 * 2. SettlementResult type with txHash/payer (middleware.ts)
 * 3. Service routes check settlement before logging earnings
 * 4. Dual decision conflict prevention (agent/index.ts)
 * 5. ServiceRequest fields populated (payerAddr, protocol, txHash)
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
  console.log('=== MATTERS: Critical Fixes Verification ===\n');

  // --- Fix 1: toolRunner-based execution ---
  console.log('[1] Tool Execution via toolRunner');
  const decisionEngine = readSrc('src/lib/agent/decision-engine.ts');

  check('Uses anthropic.beta.messages.toolRunner()', decisionEngine.includes('anthropic.beta.messages.toolRunner('));
  check('No manual tool.run() loop', !decisionEngine.includes('typeof (tool as any).run'));
  check('No manual messages.create loop', !decisionEngine.includes('for (let i = 0; i < 5'));
  check('Sets max_iterations', decisionEngine.includes('max_iterations:'));
  check('Iterates runner for tool call tracking', decisionEngine.includes('for await (const message of runner)'));
  check('Calls runner.done()', decisionEngine.includes('await runner.done()'));
  check('Logs cost with correct model', decisionEngine.includes("logLlmCost(totalInput, totalOutput, 'claude-haiku-4-5-20251001')"));

  // --- Fix 2: SettlementResult type ---
  console.log('\n[2] SettlementResult Type (middleware.ts)');
  const middleware = readSrc('src/lib/payment/middleware.ts');

  check('Exports SettlementResult interface', middleware.includes('export interface SettlementResult'));
  check('SettlementResult has settled field', middleware.includes('settled: boolean'));
  check('SettlementResult has txHash field', middleware.includes('txHash?: string'));
  check('SettlementResult has payer field', middleware.includes('payer?: string'));
  check('SettlementResult has protocol field', middleware.includes('protocol?: string'));
  check('settlePayment returns SettlementResult', middleware.includes('Promise<SettlementResult>'));
  check('Extracts result.transaction', middleware.includes('result.transaction'));
  check('Extracts result.payer', middleware.includes('result.payer'));
  check('Logs txHash in success message', middleware.includes('tx=${result.transaction}'));

  // --- Fix 3: Service routes check settlement ---
  console.log('\n[3] Service Routes Settlement Check');
  const serviceRoutes = readSrc('src/routes/serviceRoutes.ts');

  check('Imports SettlementResult type', serviceRoutes.includes('type SettlementResult'));
  check('Checks settlement before earning (analyze)', serviceRoutes.includes('if (!settlement.settled && (request as any).paymentPayload)'));
  check('Returns 402 on settlement failure', serviceRoutes.includes("code: 'SETTLEMENT_FAILED'"));
  check('Only logs EARN when settled', serviceRoutes.includes('if (settlement.settled)'));
  check('No unconditional EARN logging', !serviceRoutes.includes("settled ? ' [settled]' : ' [no-payment]'"));

  // Count settlement checks (should be 3, one per service)
  const settlementChecks = (serviceRoutes.match(/SETTLEMENT_FAILED/g) || []).length;
  check('All 3 service handlers check settlement', settlementChecks === 3, `found ${settlementChecks}`);

  // --- Fix 4: Dual decision conflict prevention ---
  console.log('\n[4] Dual Decision Conflict Prevention');
  const agentIndex = readSrc('src/lib/agent/index.ts');

  check('Defines YIELD_ACTIONS list', agentIndex.includes("YIELD_ACTIONS = ['SUPPLY_AAVE', 'WITHDRAW_AAVE', 'EMERGENCY']"));
  check('Tracks claudeHandledYield flag', agentIndex.includes('let claudeHandledYield = false'));
  check('Sets claudeHandledYield on yield action', agentIndex.includes('claudeHandledYield = YIELD_ACTIONS.includes(decision.action)'));
  check('Skips routeYield when Claude handled it', agentIndex.includes('if (claudeHandledYield)'));
  check('Logs skip reason', agentIndex.includes('Yield Router: SKIPPED'));
  check('yieldRouterAction tracks result', agentIndex.includes("let yieldRouterAction = 'SKIPPED'"));

  // --- Fix 5: ServiceRequest populated fields ---
  console.log('\n[5] ServiceRequest Payment Data');

  check('Sets payerAddr from settlement', serviceRoutes.includes("payerAddr: settlement.payer || ''"));
  check('Sets protocol from settlement', serviceRoutes.includes("protocol: settlement.protocol || 'none'"));
  check('Sets txHash from settlement', serviceRoutes.includes('txHash: settlement.txHash || undefined'));

  // Count how many service handlers set payerAddr (should be 3)
  const payerAddrSets = (serviceRoutes.match(/payerAddr: settlement\.payer/g) || []).length;
  check('All 3 handlers set payerAddr', payerAddrSets === 3, `found ${payerAddrSets}`);

  const protocolSets = (serviceRoutes.match(/protocol: settlement\.protocol/g) || []).length;
  check('All 3 handlers set protocol', protocolSets === 3, `found ${protocolSets}`);

  console.log('\n=============================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('=============================\n');

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
