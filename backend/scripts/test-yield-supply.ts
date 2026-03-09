#!/usr/bin/env bun
/**
 * Test: Verify yield router supply flow with fallback (Aave fails -> Compound)
 * After the DESPERATE test withdrew everything, this tests fresh supply.
 */
import '../dotenv.ts';

async function main() {
  console.log('=== Yield Supply Fallback Test ===\n');

  const { getEoaWallet, getEoaAddress } = await import('../src/lib/wdk/index.ts');
  const { Contract, JsonRpcProvider } = await import('ethers');
  const { CHAINS, COMPOUND_CONFIG } = await import('../src/lib/wdk/config.ts');
  const { USDC_ETH_SEPOLIA_CIRCLE } = await import('../src/config/main-config.ts');
  const { ERC20_ABI } = await import('../src/lib/agent/yield-config.ts');
  const { getAllPositions, routeYield } = await import('../src/lib/agent/yield-router.ts');

  // 1. Check current state: no position should exist (DESPERATE withdrew everything)
  const positions = await getAllPositions();
  console.log(`Current positions: ${positions.length}`);
  for (const p of positions) {
    console.log(`  - ${p.protocol}: ${Number(p.supplied) / 1e6} USDC`);
  }

  // 2. Check EOA Circle USDC balance on Eth Sepolia
  const eoaAddr = await getEoaAddress();
  const ethProvider = new JsonRpcProvider(CHAINS['ethereum-sepolia'].provider);
  const circleUsdc = new Contract(USDC_ETH_SEPOLIA_CIRCLE, ERC20_ABI, ethProvider);
  const balance = BigInt((await circleUsdc.balanceOf(eoaAddr)).toString());
  console.log(`EOA Circle USDC on Eth Sepolia: ${Number(balance) / 1e6}`);

  if (balance < 1_000_000n) {
    console.log('Not enough Circle USDC to test supply. Need at least $1.');
    return;
  }

  // 3. Run routeYield with THRIVING state
  // liquidBalance is Base Sepolia balance (20.7 USDC), monthlyBurn is ~$0.14
  console.log('\nRunning routeYield(THRIVING, $20.70, $0.14)...');
  const result = await routeYield('THRIVING', 20_700_000n, 140_000n);
  console.log(`Action: ${result.action}`);
  console.log(`Reasoning: ${result.reasoning}`);
  if (result.protocol) console.log(`Protocol: ${result.protocol}`);
  if (result.amount) console.log(`Amount: ${Number(result.amount) / 1e6} USDC`);

  // 4. Check positions after
  const positionsAfter = await getAllPositions();
  console.log(`\nPositions after: ${positionsAfter.length}`);
  for (const p of positionsAfter) {
    console.log(`  - ${p.protocol}: ${Number(p.supplied) / 1e6} USDC`);
  }

  // Check final Circle USDC balance
  const finalBalance = BigInt((await circleUsdc.balanceOf(eoaAddr)).toString());
  console.log(`EOA Circle USDC after: ${Number(finalBalance) / 1e6}`);

  if (result.action === 'SUPPLY') {
    console.log('\nSUCCESS: Yield router supplied to protocol!');
  } else {
    console.log(`\nRouter returned ${result.action}. Check reasoning above.`);
  }
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
