/**
 * End-to-end payment test script.
 * Uses a separate payer wallet to pay for an AI service via x402 protocol.
 *
 * Flow:
 * 1. Fetch /services/analyze -> get 402 with payment-required header
 * 2. Parse requirements, sign EIP-3009 transferWithAuthorization
 * 3. Retry with PAYMENT-SIGNATURE header
 * 4. Server verifies, runs AI service, settles USDC on-chain
 * 5. Verify USDC moved from payer to agent
 */

import { createPublicClient, http, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { x402Client } from '@x402/core/client';
import { x402HTTPClient } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { toClientEvmSigner } from '@x402/evm';

// Payer wallet (separate from agent)
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
  console.log('=== x402 End-to-End Payment Test ===\n');

  // 1. Setup payer wallet
  const payerAccount = privateKeyToAccount(PAYER_PRIVATE_KEY);
  console.log(`Payer address: ${payerAccount.address}`);
  console.log(`Agent address: ${AGENT_ADDRESS}`);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http('https://sepolia.base.org'),
  });

  // Build ClientEvmSigner (needs address + signTypedData + readContract)
  const signer = toClientEvmSigner(payerAccount, publicClient);

  // 2. Check balances before
  const payerBalanceBefore = await getUsdcBalance(publicClient, payerAccount.address);
  const agentBalanceBefore = await getUsdcBalance(publicClient, AGENT_ADDRESS);
  console.log(`\n--- Before Payment ---`);
  console.log(`Payer USDC: ${formatUnits(payerBalanceBefore, 6)}`);
  console.log(`Agent USDC: ${formatUnits(agentBalanceBefore, 6)}`);

  // 3. Create x402 client with payer's signer
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: signer as any });
  const httpClient = new x402HTTPClient(client);

  // 4. Make initial request (expect 402)
  const serviceUrl = `${SERVER_URL}/services/analyze?data=Hello+world+this+is+a+test+of+the+x402+payment+protocol`;
  console.log(`\n--- Step 1: Initial Request ---`);
  console.log(`GET ${serviceUrl}`);

  const initialResponse = await fetch(serviceUrl);
  console.log(`Status: ${initialResponse.status}`);

  if (initialResponse.status !== 402) {
    console.error('Expected 402 Payment Required, got:', initialResponse.status);
    process.exit(1);
  }

  // 5. Parse payment requirements from header
  console.log(`\n--- Step 2: Parse Payment Requirements ---`);
  const getHeader = (name: string) => initialResponse.headers.get(name);

  let body: unknown;
  try {
    const text = await initialResponse.text();
    if (text) body = JSON.parse(text);
  } catch {}

  const paymentRequired = httpClient.getPaymentRequiredResponse(getHeader, body);
  console.log(`Version: x402 v${(paymentRequired as any).x402Version}`);
  console.log(`Scheme: ${paymentRequired.accepts[0].scheme}`);
  console.log(`Network: ${paymentRequired.accepts[0].network}`);
  console.log(`Amount: ${paymentRequired.accepts[0].amount} (${formatUnits(BigInt(paymentRequired.accepts[0].amount), 6)} USDC)`);
  console.log(`Pay to: ${paymentRequired.accepts[0].payTo}`);

  // 6. Create payment payload (signs EIP-3009 transferWithAuthorization)
  console.log(`\n--- Step 3: Sign Payment (EIP-3009) ---`);
  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
  console.log(`Payment payload created successfully`);
  console.log(`Payload version: x402 v${(paymentPayload as any).x402Version}`);

  // 7. Encode payment header and retry
  console.log(`\n--- Step 4: Retry with Payment ---`);
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
  console.log(`Header: PAYMENT-SIGNATURE = ${Object.values(paymentHeaders)[0]?.substring(0, 40)}...`);

  const paidResponse = await fetch(serviceUrl, {
    method: 'GET',
    headers: {
      ...paymentHeaders,
    },
  });

  console.log(`Status: ${paidResponse.status}`);

  // 8. Check response
  console.log(`\n--- Step 5: Response ---`);
  const responseBody = await paidResponse.json();
  console.log(`Success: ${responseBody.success}`);

  if (responseBody.success && responseBody.data) {
    console.log(`Analysis: ${responseBody.data.analysis?.substring(0, 100)}...`);
    console.log(`Insights: ${responseBody.data.insights?.length || 0} items`);
  } else {
    console.log(`Error: ${JSON.stringify(responseBody.error)}`);
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

  // 10. Check balances after (wait a bit for chain confirmation)
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
    console.log(`\n=== PAYMENT TEST PASSED ===`);
  } else {
    console.log(`\n=== PAYMENT NOT YET CONFIRMED (check explorer) ===`);
  }
}

main().catch(console.error);
