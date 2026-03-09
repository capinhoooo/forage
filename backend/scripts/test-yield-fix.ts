#!/usr/bin/env bun
/**
 * Test: Yield router fixes - EOA wallet, position queries, supply flow
 */
import '../dotenv.ts';

let passed = 0;
let failed = 0;
const results: string[] = [];

function test(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    results.push(`  PASS: ${name}`);
  } else {
    failed++;
    results.push(`  FAIL: ${name}${detail ? ` - ${detail}` : ''}`);
  }
}

async function main() {
  console.log('=== Yield Router Fix Tests ===\n');

  // 1. Test EOA wallet creation
  console.log('1. Testing EOA wallet creation...');
  const { getEoaWallet, getEoaAddress, getWalletAddress } = await import('../src/lib/wdk/index.ts');

  const wallet = await getEoaWallet('ethereum-sepolia');
  test('EOA wallet created for ethereum-sepolia', !!wallet);
  test('EOA wallet has address', !!wallet.address && wallet.address.startsWith('0x'));
  test('EOA wallet has provider', !!wallet.provider);

  // 2. Verify EOA address matches Base Sepolia EOA (same keypair)
  const eoaAddress = await getEoaAddress();
  const baseSepAddress = await getWalletAddress('base-sepolia');
  test('EOA address matches Base Sepolia EOA', eoaAddress.toLowerCase() === baseSepAddress.toLowerCase());
  console.log(`   EOA address: ${eoaAddress}`);
  console.log(`   Base Sepolia EOA: ${baseSepAddress}`);

  // 3. Check EOA USDC balances on Eth Sepolia
  console.log('\n2. Testing EOA balances on Eth Sepolia...');
  const { Contract, JsonRpcProvider } = await import('ethers');
  const { CHAINS, COMPOUND_CONFIG } = await import('../src/lib/wdk/config.ts');
  const { USDC_ETH_SEPOLIA_CIRCLE } = await import('../src/config/main-config.ts');
  const { ERC20_ABI } = await import('../src/lib/agent/yield-config.ts');

  const ethProvider = new JsonRpcProvider(CHAINS['ethereum-sepolia'].provider);
  const circleUsdc = new Contract(USDC_ETH_SEPOLIA_CIRCLE, ERC20_ABI, ethProvider);
  const circleBalance = BigInt((await circleUsdc.balanceOf(eoaAddress)).toString());
  console.log(`   Circle USDC balance: ${Number(circleBalance) / 1e6}`);
  test('Circle USDC balance readable', circleBalance >= 0n);

  // 4. Check Compound V3 position (should have ~2 USDC from prior test)
  console.log('\n3. Testing position queries (EOA-based)...');
  const { getAllPositions } = await import('../src/lib/agent/yield-router.ts');
  const positions = await getAllPositions();
  console.log(`   Found ${positions.length} position(s)`);
  for (const p of positions) {
    console.log(`   - ${p.protocol} on ${p.chain}: ${Number(p.supplied) / 1e6} USDC`);
  }

  const compoundPos = positions.find(p => p.protocol === 'compound-v3');
  test('Compound V3 position detected', !!compoundPos && compoundPos.supplied > 0n);
  if (compoundPos) {
    test('Compound V3 position > $1', compoundPos.supplied >= 1_000_000n);
  }

  // 5. Test yield rates query
  console.log('\n4. Testing yield rates...');
  const { queryAllRates } = await import('../src/lib/agent/yield-rates.ts');
  const rates = await queryAllRates();
  console.log(`   Found ${rates.length} rate(s)`);
  for (const r of rates) {
    console.log(`   - ${r.protocol} on ${r.chain}: APY=${(r.apy * 100).toFixed(2)}% (risk-adj: ${(r.riskAdjustedApy * 100).toFixed(2)}%)`);
  }
  test('At least one rate returned', rates.length > 0);

  // 6. Test router decision (dry run, no actual supply)
  console.log('\n5. Testing router decision logic...');
  const { routeYield } = await import('../src/lib/agent/yield-router.ts');

  // Simulate with small balance (should HOLD)
  const smallResult = await routeYield('THRIVING', 500_000n, 200_000n); // $0.50 balance, $0.20 burn
  console.log(`   Small balance: ${smallResult.action} - ${smallResult.reasoning}`);
  test('Small balance returns HOLD', smallResult.action === 'HOLD');

  // Simulate with large balance, should try to supply but will detect existing position
  // (since we already have Compound V3 position from prior test)
  const largeResult = await routeYield('THRIVING', 20_000_000n, 140_000n); // $20 balance, $0.14 burn
  console.log(`   Large balance: ${largeResult.action} - ${largeResult.reasoning}`);
  test('Large balance returns SUPPLY or HOLD (has position)', ['SUPPLY', 'HOLD'].includes(largeResult.action));

  // 7. Test DESPERATE state triggers withdrawal
  console.log('\n6. Testing DESPERATE state...');
  const desperateResult = await routeYield('DESPERATE', 100_000n, 1_000_000n); // $0.10 balance, $1 burn
  console.log(`   Desperate: ${desperateResult.action} - ${desperateResult.reasoning}`);
  test('DESPERATE state triggers WITHDRAW_ALL', desperateResult.action === 'WITHDRAW_ALL');

  // Summary
  console.log('\n=== Results ===');
  for (const r of results) console.log(r);
  console.log(`\n${passed}/${passed + failed} tests passed`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
