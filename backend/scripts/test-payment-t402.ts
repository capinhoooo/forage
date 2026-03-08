/**
 * End-to-end t402 payment test script.
 * Tests the t402 protocol path (complement to existing x402 test).
 * Uses the same payer wallet but speaks t402 instead of x402.
 *
 * Flow:
 * 1. Fetch /services/analyze -> get 402 with x402 header + t402 body
 * 2. Parse t402 requirements from response body (t402PaymentRequired field)
 * 3. Sign EIP-3009 via t402 client
 * 4. Retry with PAYMENT-SIGNATURE header (t402Version payload)
 * 5. Server detects t402, verifies+settles via t402 facilitator
 */

import { createPublicClient, http, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { t402Client, t402HTTPClient } from '@t402/core/client';
import { registerExactEvmScheme } from '@t402/evm/exact/client';

// Same payer wallet as x402 test
const PAYER_PRIVATE_KEY = '0xdc4220c74497a92e5ba171fadf2021ced04ed6af37853399d55d3fa70e45ca8e';
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const AGENT_ADDRESS = '0x0b2F686aE96eF49939c7f7E0b5BCb3E10398cc73';
const SERVER_URL = 'http://localhost:3700';

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

async function getUsdcBalance(publicClient: any, address: string): Promise<bigint> {
  return publicClient.readContract({
    address: USDC_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  }) as Promise<bigint>;
}

async function main() {
  console.log('=== t402 End-to-End Payment Test ===\n');

  // 1. Setup payer wallet
  const payerAccount = privateKeyToAccount(PAYER_PRIVATE_KEY);
  console.log(`Payer address: ${payerAccount.address}`);
  console.log(`Agent address: ${AGENT_ADDRESS}`);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http('https://sepolia.base.org'),
  });

  // Build t402 ClientEvmSigner (simpler than x402: just address + signTypedData)
  const signer = {
    address: payerAccount.address as `0x${string}`,
    signTypedData: async (message: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    }) => {
      return payerAccount.signTypedData({
        domain: message.domain as any,
        types: message.types as any,
        primaryType: message.primaryType as any,
        message: message.message as any,
      });
    },
  };

  // 2. Check balances before
  const payerBalanceBefore = await getUsdcBalance(publicClient, payerAccount.address);
  const agentBalanceBefore = await getUsdcBalance(publicClient, AGENT_ADDRESS);
  console.log(`\n--- Before Payment ---`);
  console.log(`Payer USDC: ${formatUnits(payerBalanceBefore, 6)}`);
  console.log(`Agent USDC: ${formatUnits(agentBalanceBefore, 6)}`);

  // 3. Create t402 client with payer's signer
  const client = new t402Client();
  registerExactEvmScheme(client, { signer: signer as any });
  const httpClient = new t402HTTPClient(client);

  // 4. Make initial request (expect 402)
  const serviceUrl = `${SERVER_URL}/services/analyze?data=Hello+world+testing+t402+protocol+payment`;
  console.log(`\n--- Step 1: Initial Request ---`);
  console.log(`GET ${serviceUrl}`);

  const initialResponse = await fetch(serviceUrl);
  console.log(`Status: ${initialResponse.status}`);

  if (initialResponse.status !== 402) {
    console.error('Expected 402 Payment Required, got:', initialResponse.status);
    process.exit(1);
  }

  // 5. Parse t402 payment requirements from response body
  console.log(`\n--- Step 2: Parse t402 Payment Requirements ---`);
  const responseBody = await initialResponse.json() as any;
  console.log(`Protocols advertised: ${JSON.stringify(responseBody.protocols)}`);

  if (!responseBody.t402PaymentRequired) {
    console.error('No t402PaymentRequired in response body');
    process.exit(1);
  }

  // Decode the base64 t402 payment required
  const t402PaymentRequired = JSON.parse(
    Buffer.from(responseBody.t402PaymentRequired, 'base64').toString('utf-8')
  );

  console.log(`Version: t402 v${t402PaymentRequired.t402Version}`);
  console.log(`Accepts: ${t402PaymentRequired.accepts.length} option(s)`);
  console.log(`Scheme: ${t402PaymentRequired.accepts[0].scheme}`);
  console.log(`Network: ${t402PaymentRequired.accepts[0].network}`);
  console.log(`Amount: ${t402PaymentRequired.accepts[0].amount} (${formatUnits(BigInt(t402PaymentRequired.accepts[0].amount), 6)} USDC)`);
  console.log(`Pay to: ${t402PaymentRequired.accepts[0].payTo}`);
  console.log(`Token type: ${t402PaymentRequired.accepts[0].extra?.tokenType || 'unknown'}`);

  // 6. Create payment payload (signs EIP-3009 transferWithAuthorization)
  console.log(`\n--- Step 3: Sign Payment via t402 (EIP-3009) ---`);
  const paymentPayload = await httpClient.createPaymentPayload(t402PaymentRequired);
  console.log(`Payment payload created successfully`);
  console.log(`Payload version: t402 v${(paymentPayload as any).t402Version}`);

  // 7. Encode payment header and retry
  console.log(`\n--- Step 4: Retry with t402 Payment ---`);
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
  const headerKey = Object.keys(paymentHeaders)[0];
  const headerVal = Object.values(paymentHeaders)[0] as string;
  console.log(`Header: ${headerKey} = ${headerVal?.substring(0, 40)}...`);

  // Verify it's t402 format
  const decodedPayload = JSON.parse(Buffer.from(headerVal, 'base64').toString('utf-8'));
  console.log(`Protocol in payload: ${decodedPayload.t402Version ? 't402' : decodedPayload.x402Version ? 'x402' : 'unknown'} v${decodedPayload.t402Version || decodedPayload.x402Version}`);

  const paidResponse = await fetch(serviceUrl, {
    method: 'GET',
    headers: {
      ...paymentHeaders,
    },
  });

  console.log(`Status: ${paidResponse.status}`);

  // 8. Check response
  console.log(`\n--- Step 5: Response ---`);
  const paidBody = await paidResponse.json() as any;
  console.log(`Success: ${paidBody.success}`);

  if (paidBody.success && paidBody.data) {
    console.log(`Analysis: ${paidBody.data.analysis?.substring(0, 100)}...`);
    console.log(`Insights: ${paidBody.data.insights?.length || 0} items`);
  } else {
    console.log(`Error: ${JSON.stringify(paidBody.error)}`);
  }

  // 9. Check settlement header
  const paymentResponse = paidResponse.headers.get('payment-response') || paidResponse.headers.get('PAYMENT-RESPONSE');
  if (paymentResponse) {
    try {
      const settlement = httpClient.getPaymentSettleResponse(
        (name: string) => paidResponse.headers.get(name),
      );
      console.log(`\n--- Step 6: Settlement ---`);
      console.log(`Settlement success: ${(settlement as any).success}`);
      console.log(`Transaction: ${(settlement as any).transaction}`);
      console.log(`Network: ${(settlement as any).network}`);
    } catch (e) {
      console.log(`Settlement header parse error: ${e}`);
    }
  } else {
    console.log(`\nNo PAYMENT-RESPONSE header (settlement may have failed or is async)`);
  }

  // 10. Check balances after
  console.log(`\n--- Step 7: Balance Check (after) ---`);
  await new Promise(resolve => setTimeout(resolve, 3000));

  const payerBalanceAfter = await getUsdcBalance(publicClient, payerAccount.address);
  const agentBalanceAfter = await getUsdcBalance(publicClient, AGENT_ADDRESS);
  console.log(`Payer USDC: ${formatUnits(payerBalanceAfter, 6)} (was ${formatUnits(payerBalanceBefore, 6)})`);
  console.log(`Agent USDC: ${formatUnits(agentBalanceAfter, 6)} (was ${formatUnits(agentBalanceBefore, 6)})`);

  const payerDiff = payerBalanceBefore - payerBalanceAfter;
  const agentDiff = agentBalanceAfter - agentBalanceBefore;
  console.log(`Payer spent: ${formatUnits(payerDiff, 6)} USDC`);
  console.log(`Agent received: ${formatUnits(agentDiff, 6)} USDC`);

  if (agentDiff > 0n) {
    console.log(`\n=== t402 PAYMENT TEST PASSED ===`);
  } else {
    console.log(`\n=== PAYMENT NOT YET CONFIRMED (check explorer) ===`);
  }
}

main().catch(console.error);
