/**
 * End-to-end t402 exact-legacy (USDT) payment test on Ethereum Sepolia.
 *
 * Flow:
 * 1. Payer approves facilitator (spender) to spend USDt
 * 2. Fetch /services/analyze -> get 402 with t402 body (exact-legacy option)
 * 3. Sign EIP-712 LegacyTransferAuthorization via t402 client
 * 4. Retry with PAYMENT-SIGNATURE header (t402Version payload)
 * 5. Server verifies signature + allowance, settles via transferFrom on Eth Sepolia
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  parseAbi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { t402Client, t402HTTPClient } from '@t402/core/client';
import { ExactLegacyEvmClientScheme } from '@t402/evm';

// Same payer wallet as other tests
const PAYER_PRIVATE_KEY = '0xdc4220c74497a92e5ba171fadf2021ced04ed6af37853399d55d3fa70e45ca8e';
const USDT_ADDRESS = '0xd077a400968890eacc75cdc901f0356c943e4fdb';
const AGENT_ADDRESS = '0x0b2F686aE96eF49939c7f7E0b5BCb3E10398cc73';
const SERVER_URL = 'http://localhost:3700';
const ETH_SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

async function main() {
  console.log('=== t402 Exact-Legacy (USDt) End-to-End Payment Test ===\n');

  // 1. Setup payer wallet on Eth Sepolia
  const payerAccount = privateKeyToAccount(PAYER_PRIVATE_KEY);
  console.log(`Payer address: ${payerAccount.address}`);
  console.log(`Agent address: ${AGENT_ADDRESS}`);
  console.log(`USDt contract: ${USDT_ADDRESS}`);
  console.log(`Network: Ethereum Sepolia (eip155:11155111)`);

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(ETH_SEPOLIA_RPC),
  });

  const walletClient = createWalletClient({
    account: payerAccount,
    chain: sepolia,
    transport: http(ETH_SEPOLIA_RPC),
  });

  // 2. Check balances before
  const payerUsdtBefore = await publicClient.readContract({
    address: USDT_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [payerAccount.address],
  });
  const agentUsdtBefore = await publicClient.readContract({
    address: USDT_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [AGENT_ADDRESS as `0x${string}`],
  });

  console.log(`\n--- Before Payment ---`);
  console.log(`Payer USDt: ${formatUnits(payerUsdtBefore, 6)}`);
  console.log(`Agent USDt: ${formatUnits(agentUsdtBefore, 6)}`);

  if (payerUsdtBefore === 0n) {
    console.error('Payer has no USDt! Get test tokens from Candide faucet first.');
    process.exit(1);
  }

  // 3. Approve facilitator (spender = agent address) to spend USDt
  console.log(`\n--- Step 1: Approve Facilitator ---`);
  const currentAllowance = await publicClient.readContract({
    address: USDT_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [payerAccount.address, AGENT_ADDRESS as `0x${string}`],
  });
  console.log(`Current allowance: ${formatUnits(currentAllowance, 6)} USDt`);

  if (currentAllowance < 50000n) {
    console.log(`Approving ${AGENT_ADDRESS} to spend 1 USDt...`);
    const approveTx = await walletClient.writeContract({
      address: USDT_ADDRESS as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [AGENT_ADDRESS as `0x${string}`, 1_000_000n], // 1 USDt (enough for multiple tests)
    });
    console.log(`Approve tx: ${approveTx}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: approveTx });
    console.log(`Approve confirmed: ${receipt.status}`);
  } else {
    console.log(`Allowance sufficient, skipping approve`);
  }

  // 4. Fetch 402 and parse t402 exact-legacy requirements
  console.log(`\n--- Step 2: Fetch 402 Response ---`);
  const serviceUrl = `${SERVER_URL}/services/analyze?data=Testing+t402+exact-legacy+USDT+payment+on+Ethereum+Sepolia`;
  const initialResponse = await fetch(serviceUrl);
  console.log(`Status: ${initialResponse.status}`);

  if (initialResponse.status !== 402) {
    console.error(`Expected 402, got ${initialResponse.status}`);
    process.exit(1);
  }

  const responseBody = await initialResponse.json() as any;
  console.log(`Protocols: ${JSON.stringify(responseBody.protocols)}`);

  if (!responseBody.t402PaymentRequired) {
    console.error('No t402PaymentRequired in response body');
    process.exit(1);
  }

  const t402PaymentRequired = JSON.parse(
    Buffer.from(responseBody.t402PaymentRequired, 'base64').toString('utf-8')
  );

  // Find the exact-legacy option (USDT on Eth Sepolia)
  const legacyOption = t402PaymentRequired.accepts.find(
    (a: any) => a.scheme === 'exact-legacy'
  );

  if (!legacyOption) {
    console.error('No exact-legacy option in t402 payment requirements');
    console.log('Available schemes:', t402PaymentRequired.accepts.map((a: any) => a.scheme));
    process.exit(1);
  }

  console.log(`\n--- Step 3: Parse exact-legacy Requirements ---`);
  console.log(`Scheme: ${legacyOption.scheme}`);
  console.log(`Network: ${legacyOption.network}`);
  console.log(`Asset: ${legacyOption.asset}`);
  console.log(`Amount: ${legacyOption.amount} (${formatUnits(BigInt(legacyOption.amount), 6)} USDt)`);
  console.log(`Pay to: ${legacyOption.payTo}`);
  console.log(`Spender: ${legacyOption.extra?.spender}`);
  console.log(`Token type: ${legacyOption.extra?.tokenType}`);

  // 5. Create t402 client with exact-legacy scheme
  console.log(`\n--- Step 4: Sign Payment via t402 exact-legacy ---`);
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

  const client = new t402Client();
  // Register exact-legacy scheme with client signer
  client.register('eip155:11155111', new ExactLegacyEvmClientScheme(signer as any) as any);
  const httpClient = new t402HTTPClient(client);

  // Filter requirements to only include the exact-legacy option
  const filteredRequirements = {
    ...t402PaymentRequired,
    accepts: [legacyOption],
  };

  const paymentPayload = await httpClient.createPaymentPayload(filteredRequirements);
  console.log(`Payment payload created successfully`);
  console.log(`Payload version: t402 v${(paymentPayload as any).t402Version}`);

  // 6. Encode and send payment
  console.log(`\n--- Step 5: Retry with t402 exact-legacy Payment ---`);
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
  const headerKey = Object.keys(paymentHeaders)[0];
  const headerVal = Object.values(paymentHeaders)[0] as string;
  console.log(`Header: ${headerKey} = ${headerVal?.substring(0, 40)}...`);

  const decodedPayload = JSON.parse(Buffer.from(headerVal, 'base64').toString('utf-8'));
  console.log(`Protocol: ${decodedPayload.t402Version ? 't402' : 'unknown'} v${decodedPayload.t402Version}`);

  const paidResponse = await fetch(serviceUrl, {
    method: 'GET',
    headers: { ...paymentHeaders },
  });

  console.log(`Status: ${paidResponse.status}`);

  // 7. Check response
  console.log(`\n--- Step 6: Response ---`);
  const paidBody = await paidResponse.json() as any;
  console.log(`Success: ${paidBody.success}`);

  if (paidBody.success && paidBody.data) {
    console.log(`Analysis: ${paidBody.data.analysis?.substring(0, 100)}...`);
  } else {
    console.log(`Error: ${JSON.stringify(paidBody.error)}`);
  }

  // 8. Check settlement
  const paymentResponse = paidResponse.headers.get('payment-response') || paidResponse.headers.get('PAYMENT-RESPONSE');
  if (paymentResponse) {
    try {
      const settlement = httpClient.getPaymentSettleResponse(
        (name: string) => paidResponse.headers.get(name),
      );
      console.log(`\n--- Step 7: Settlement ---`);
      console.log(`Settlement success: ${(settlement as any).success}`);
      console.log(`Transaction: ${(settlement as any).transaction}`);
      console.log(`Network: ${(settlement as any).network}`);
    } catch (e) {
      console.log(`Settlement header parse error: ${e}`);
    }
  } else {
    console.log(`\nNo PAYMENT-RESPONSE header`);
  }

  // 9. Check balances after
  console.log(`\n--- Step 8: Balance Check (after) ---`);
  await new Promise(resolve => setTimeout(resolve, 5000));

  const payerUsdtAfter = await publicClient.readContract({
    address: USDT_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [payerAccount.address],
  });
  const agentUsdtAfter = await publicClient.readContract({
    address: USDT_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [AGENT_ADDRESS as `0x${string}`],
  });

  console.log(`Payer USDt: ${formatUnits(payerUsdtAfter, 6)} (was ${formatUnits(payerUsdtBefore, 6)})`);
  console.log(`Agent USDt: ${formatUnits(agentUsdtAfter, 6)} (was ${formatUnits(agentUsdtBefore, 6)})`);

  const payerDiff = payerUsdtBefore - payerUsdtAfter;
  const agentDiff = agentUsdtAfter - agentUsdtBefore;
  console.log(`Payer spent: ${formatUnits(payerDiff, 6)} USDt`);
  console.log(`Agent received: ${formatUnits(agentDiff, 6)} USDt`);

  if (agentDiff > 0n) {
    console.log(`\n=== t402 EXACT-LEGACY (USDt) PAYMENT TEST PASSED ===`);
  } else {
    console.log(`\n=== PAYMENT NOT YET CONFIRMED (check Sepolia Etherscan) ===`);
  }
}

main().catch(console.error);
