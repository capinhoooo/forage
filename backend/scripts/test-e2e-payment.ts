/**
 * E2E Payment Test: Full payment flow with real client wallet
 *
 * Flow:
 * 1. Hit /services/analyze -> get 402 response
 * 2. Parse x402 payment-required header
 * 3. Sign EIP-3009 transferWithAuthorization via x402Client
 * 4. Send request with payment header
 * 5. Verify: service result returned, settlement logged, DB records created
 */

import { x402Client, x402HTTPClient } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { toClientEvmSigner } from '@x402/evm';
import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const SERVER = 'http://localhost:3700';
const CLIENT_PK = '0xdc4220c74497a92e5ba171fadf2021ced04ed6af37853399d55d3fa70e45ca8e';

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
  console.log('=== E2E Payment Flow Test ===\n');

  // --- Setup client wallet ---
  console.log('[0] Client Setup');
  const account = privateKeyToAccount(CLIENT_PK as `0x${string}`);
  console.log(`  Client wallet: ${account.address}`);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  // toClientEvmSigner properly sets .address for x402 scheme
  const signer = toClientEvmSigner(account as any, publicClient as any);

  // Build x402 client
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: signer as any });
  const httpClient = new x402HTTPClient(client);

  // --- Step 1: Get 402 response ---
  console.log('\n[1] Request Service (expect 402)');
  const res402 = await fetch(`${SERVER}/services/analyze?data=Bitcoin+price+is+60000`);
  check('Returns 402', res402.status === 402, `HTTP ${res402.status}`);

  const paymentRequiredHeader = res402.headers.get('payment-required');
  check('Has payment-required header', !!paymentRequiredHeader);

  if (!paymentRequiredHeader) {
    console.log('\n  Cannot proceed without payment-required header');
    process.exit(1);
  }

  // --- Step 2: Parse payment required ---
  console.log('\n[2] Parse Payment Required');
  const paymentRequired = httpClient.getPaymentRequiredResponse(
    (name: string) => res402.headers.get(name),
  );

  check('Has x402Version', paymentRequired.x402Version === 2, `v${paymentRequired.x402Version}`);
  check('Has accepts array', Array.isArray(paymentRequired.accepts) && paymentRequired.accepts.length > 0, `${paymentRequired.accepts?.length} options`);

  const exactAccept = paymentRequired.accepts?.find((a: any) => a.scheme === 'exact' && a.network === 'eip155:84532');
  check('Found exact scheme on Base Sepolia', !!exactAccept);

  if (exactAccept) {
    check('Correct USDC asset', exactAccept.asset?.toLowerCase() === '0x036cbd53842c5426634e7929541ec2318f3dcf7e');
    check('Amount is 50000 (0.05 USDC)', exactAccept.amount === '50000');
    check('PayTo is server wallet', exactAccept.payTo?.toLowerCase() === '0x0b2f686ae96ef49939c7f7e0b5bcb3e10398cc73');
  }

  // --- Step 3: Create payment payload (sign EIP-3009) ---
  console.log('\n[3] Create Payment Payload (EIP-3009 signing)');
  let paymentPayload: any;
  try {
    paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
    check('Payment payload created', true);
    check('Has payload data', !!paymentPayload);

    // Check payload structure
    if (paymentPayload) {
      check('Has x402Version in payload', paymentPayload.x402Version === 2);
      check('Has payload field', !!paymentPayload.payload);
    }
  } catch (e: any) {
    check('Payment payload created', false, e.message);
    console.log('\n  Cannot proceed without payment payload');
    console.log(`  Error: ${e.message}`);
    console.log(`\n=============================`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('=============================\n');
    process.exit(1);
  }

  // --- Step 4: Send payment request ---
  console.log('\n[4] Send Paid Request');
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
  check('Payment headers generated', Object.keys(paymentHeaders).length > 0, Object.keys(paymentHeaders).join(', '));

  const paidRes = await fetch(`${SERVER}/services/analyze?data=Bitcoin+price+is+60000.+Ethereum+is+at+3200.+Analyze+the+market.`, {
    headers: {
      ...paymentHeaders,
    },
  });

  console.log(`  HTTP Status: ${paidRes.status}`);
  const paidBody = await paidRes.json() as any;

  check('Returns 200 (service delivered)', paidRes.status === 200, `HTTP ${paidRes.status}`);
  check('Response has success=true', paidBody.success === true);

  if (paidBody.success && paidBody.data) {
    check('Has analysis result', !!paidBody.data.analysis, `${(paidBody.data.analysis || '').slice(0, 80)}...`);
    check('Has insights array', Array.isArray(paidBody.data.insights));
    console.log(`  Analysis preview: ${(paidBody.data.analysis || '').slice(0, 120)}...`);
  } else if (paidBody.error) {
    check('No error in response', false, JSON.stringify(paidBody.error));
  }

  // Check settlement response header
  const settleHeader = paidRes.headers.get('x-payment-settled') || paidRes.headers.get('x-settle-response');
  if (settleHeader) {
    check('Settlement header present', true, settleHeader.slice(0, 60));
  }

  // --- Step 5: Verify DB records ---
  console.log('\n[5] Verify Server State');

  // Check agent history for the EARN transaction
  const histRes = await fetch(`${SERVER}/agent/history?limit=5&type=EARN`);
  const histBody = await histRes.json() as any;

  if (histBody.success && Array.isArray(histBody.data) && histBody.data.length > 0) {
    const latestEarn = histBody.data[0];
    check('EARN transaction recorded', latestEarn.type === 'EARN');
    check('Correct earn amount', latestEarn.amount?.toString() === '50000' || Number(latestEarn.amount) === 50000, `amount=${latestEarn.amount}`);
    if (latestEarn.txHash) {
      check('Transaction hash captured', latestEarn.txHash.startsWith('0x'), latestEarn.txHash.slice(0, 20));
    }
    if (latestEarn.description) {
      check('Description mentions settlement', latestEarn.description.includes('settled'), latestEarn.description.slice(0, 80));
    }
  } else {
    check('EARN transaction recorded', false, 'no EARN transactions found');
  }

  // Check service stats
  const svcRes = await fetch(`${SERVER}/agent/services`);
  const svcBody = await svcRes.json() as any;
  if (svcBody.success && svcBody.data?.services) {
    const analyzeSvc = svcBody.data.services.find((s: any) => s.name === 'analyze' || s.service === 'analyze');
    if (analyzeSvc) {
      check('Analyze service has requests', (analyzeSvc.totalRequests || analyzeSvc.requestCount || 0) > 0, `requests=${analyzeSvc.totalRequests || analyzeSvc.requestCount}`);
    }
  }

  // --- Summary ---
  console.log('\n=============================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('=============================\n');

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
