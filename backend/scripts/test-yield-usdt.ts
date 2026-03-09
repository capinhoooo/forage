#!/usr/bin/env bun
/**
 * Test: USDT yield routing - positions, rates, supply to Aave on Base Sepolia
 */
import '../dotenv.ts';

let passed = 0;
let failed = 0;
const results: string[] = [];

function test(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; results.push(`  PASS: ${name}`); }
  else { failed++; results.push(`  FAIL: ${name}${detail ? ` - ${detail}` : ''}`); }
}

async function main() {
  console.log('=== USDT Yield Router Tests ===\n');

  const { getEoaAddress } = await import('../src/lib/wdk/index.ts');
  const { queryAllRates } = await import('../src/lib/agent/yield-rates.ts');
  const { getAllPositions, routeYield } = await import('../src/lib/agent/yield-router.ts');
  const { Contract, JsonRpcProvider } = await import('ethers');
  const { CHAINS } = await import('../src/lib/wdk/config.ts');
  const { ERC20_ABI } = await import('../src/lib/agent/yield-config.ts');

  const eoaAddr = await getEoaAddress();
  console.log('EOA:', eoaAddr);

  // 1. Check rates include USDT
  console.log('\n1. Testing rates (USDC + USDT)...');
  const rates = await queryAllRates();
  const usdcRates = rates.filter(r => r.token === 'USDC');
  const usdtRates = rates.filter(r => r.token === 'USDT');
  console.log(`   Total: ${rates.length} rates (${usdcRates.length} USDC, ${usdtRates.length} USDT)`);
  for (const r of rates) {
    console.log(`   - ${r.protocol} (${r.token}) on ${r.chain}: APY=${(r.apy * 100).toFixed(2)}%`);
  }
  test('USDT rates returned', usdtRates.length >= 2);
  test('USDC rates still returned', usdcRates.length >= 2);

  // 2. Check USDT balances
  console.log('\n2. Checking Aave test USDT balances...');
  const baseUsdtBal = await new Contract(
    '0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a', ERC20_ABI,
    new JsonRpcProvider(CHAINS['base-sepolia'].provider),
  ).balanceOf(eoaAddr);
  const ethUsdtBal = await new Contract(
    '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0', ERC20_ABI,
    new JsonRpcProvider(CHAINS['ethereum-sepolia'].provider),
  ).balanceOf(eoaAddr);
  console.log(`   Base Sepolia: ${Number(baseUsdtBal) / 1e6} USDT`);
  console.log(`   Eth Sepolia: ${Number(ethUsdtBal) / 1e6} USDT`);
  test('Has Aave test USDT on Base Sepolia', Number(baseUsdtBal) >= 1_000_000);

  // 3. Check positions before
  console.log('\n3. Positions before supply...');
  const posBefore = await getAllPositions();
  console.log(`   ${posBefore.length} position(s)`);
  for (const p of posBefore) {
    console.log(`   - ${p.protocol} (${p.token}) on ${p.chain}: ${Number(p.supplied) / 1e6}`);
  }

  // 4. Run yield router (should supply USDT to Aave Base Sepolia since it has balance and uncapped)
  console.log('\n4. Running routeYield(THRIVING)...');
  const result = await routeYield('THRIVING', 20_700_000n, 140_000n);
  console.log(`   Action: ${result.action}`);
  console.log(`   Reasoning: ${result.reasoning}`);
  if (result.protocol) console.log(`   Protocol: ${result.protocol}`);
  if (result.token) console.log(`   Token: ${result.token}`);
  if (result.amount) console.log(`   Amount: ${Number(result.amount) / 1e6}`);

  // 5. Check positions after
  console.log('\n5. Positions after...');
  const posAfter = await getAllPositions();
  console.log(`   ${posAfter.length} position(s)`);
  for (const p of posAfter) {
    console.log(`   - ${p.protocol} (${p.token}) on ${p.chain}: ${Number(p.supplied) / 1e6}`);
  }

  const usdtPos = posAfter.find(p => p.token === 'USDT');
  test('USDT position exists after routing', !!usdtPos);
  if (usdtPos) {
    test('USDT position is in Aave V3', usdtPos.protocol === 'aave-v3-usdt');
    test('USDT position > $1', usdtPos.supplied >= 1_000_000n);
    console.log(`   USDT in Aave: ${Number(usdtPos.supplied) / 1e6} USDT on ${usdtPos.chain}`);
  }

  // Summary
  console.log('\n=== Results ===');
  for (const r of results) console.log(r);
  console.log(`\n${passed}/${passed + failed} tests passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Test error:', err); process.exit(1); });
