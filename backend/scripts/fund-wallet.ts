#!/usr/bin/env bun
/**
 * Fund the Forage agent wallet with Aave test tokens matching earned surplus.
 *
 * Mirrors the agent's Circle USDC earnings into Aave test USDC/USDT so the
 * yield router has tokens it can actually supply to Aave on testnet.
 * (On mainnet this wouldn't be needed since Aave accepts real USDC.)
 *
 * The mint amount = agent's Circle USDC balance minus 2x monthly burn reserve.
 * This keeps the demo realistic: yield supplied matches what the agent earned.
 *
 * Usage:
 *   bun run scripts/fund-wallet.ts                # Mint surplus as Aave tokens
 *   bun run scripts/fund-wallet.ts --check        # Just show balances, no mint
 *   bun run scripts/fund-wallet.ts --amount 5     # Mint exactly $5 of each
 */

import '../dotenv.ts';

import { JsonRpcProvider, Contract, formatUnits, parseUnits } from 'ethers';
import { getEoaWallet, getWalletAddress } from '../src/lib/wdk/index.ts';
import { BASE_SEPOLIA_RPC, USDC_BASE_SEPOLIA, AGENT_MONTHLY_BURN_ESTIMATE } from '../src/config/main-config.ts';
import { AAVE_CONFIG } from '../src/lib/wdk/config.ts';

const FAUCET_ABI = [
  'function mint(address token, address to, uint256 amount) external',
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

async function getBalance(provider: JsonRpcProvider, tokenAddress: string, walletAddress: string): Promise<bigint> {
  try {
    const token = new Contract(tokenAddress, ERC20_ABI, provider);
    const balance = await token.balanceOf(walletAddress);
    return BigInt(balance.toString());
  } catch {
    return 0n;
  }
}

function $(amount: bigint): string {
  return `$${(Number(amount) / 1e6).toFixed(2)}`;
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const amountIdx = args.indexOf('--amount');
  const fixedAmount = amountIdx !== -1 ? parseUnits(args[amountIdx + 1], 6) : null;

  const provider = new JsonRpcProvider(BASE_SEPOLIA_RPC);
  const walletAddress = await getWalletAddress();
  const aave = AAVE_CONFIG['base-sepolia'];
  // Use actual burn from the running agent if available, else fall back to config
  let monthlyBurn = BigInt(AGENT_MONTHLY_BURN_ESTIMATE);
  const port = process.env.APP_PORT || '3700';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`http://localhost:${port}/agent/status`, { signal: ctrl.signal });
    clearTimeout(timer);
    const json = await res.json() as any;
    if (json.data?.monthlyBurn) {
      monthlyBurn = BigInt(json.data.monthlyBurn);
      console.log(`(Using live monthly burn: $${Number(monthlyBurn) / 1e6})`);
    }
  } catch {
    console.log(`(Agent not reachable, using config burn: $${Number(monthlyBurn) / 1e6})`);
  }
  const reserve = monthlyBurn * 2n;

  console.log('=== Forage Wallet Funding ===\n');
  console.log(`Wallet:  ${walletAddress}`);
  console.log(`Chain:   Base Sepolia (84532)\n`);

  // Read all balances
  const ethBal = await provider.getBalance(walletAddress);
  const circleUsdcBal = await getBalance(provider, USDC_BASE_SEPOLIA, walletAddress);
  const aaveUsdcBal = await getBalance(provider, aave.usdc, walletAddress);
  const aaveUsdtBal = await getBalance(provider, aave.usdt, walletAddress);
  const aUsdcBal = await getBalance(provider, aave.aUsdc, walletAddress);
  const aUsdtBal = await getBalance(provider, aave.aUsdt, walletAddress);

  console.log('Balances:');
  console.log(`  ETH (gas):              ${formatUnits(ethBal, 18)} ETH`);
  console.log(`  Circle USDC (earned):   ${$(circleUsdcBal)}`);
  console.log(`  Aave USDC (mintable):   ${$(aaveUsdcBal)}`);
  console.log(`  Aave USDT (mintable):   ${$(aaveUsdtBal)}`);
  console.log(`  aUSDC (in Aave):        ${$(aUsdcBal)}`);
  console.log(`  aUSDT (in Aave):        ${$(aUsdtBal)}`);

  // Calculate surplus
  const surplus = circleUsdcBal > reserve ? circleUsdcBal - reserve : 0n;
  console.log(`\nAgent earnings:           ${$(circleUsdcBal)}`);
  console.log(`Reserve (2x burn):        ${$(reserve)}`);
  console.log(`Surplus for yield:        ${$(surplus)}`);

  // Determine mint amount
  let mintAmount: bigint;
  if (fixedAmount) {
    mintAmount = BigInt(fixedAmount.toString());
    console.log(`\nMint amount (manual):     ${$(mintAmount)}`);
  } else {
    mintAmount = surplus;
    console.log(`\nMint amount (= surplus):  ${$(mintAmount)}`);
  }

  if (mintAmount < 1_000_000n) {
    console.log('\nSurplus < $1.00. Nothing to mint.');
    if (circleUsdcBal === 0n) {
      console.log('\nThe agent has no earnings yet. Run the traffic simulator first:');
      console.log('  bun run scripts/simulate-traffic.ts --loop');
    }
    return;
  }

  if (checkOnly) {
    console.log('\n(--check mode, no minting)');
    return;
  }

  if (ethBal < parseUnits('0.001', 18)) {
    console.log('\nWARNING: Low ETH for gas. Get Base Sepolia ETH first:');
    console.log('  https://faucets.chain.link/base-sepolia');
    return;
  }

  // Mint
  const wallet = await getEoaWallet('base-sepolia');
  const faucet = new Contract(aave.faucet, FAUCET_ABI, wallet);

  console.log(`\nMinting Aave test tokens (mirroring ${$(mintAmount)} surplus)...\n`);

  // Mint USDC
  try {
    process.stdout.write(`  Aave USDC ${$(mintAmount)} ... `);
    const tx = await faucet.mint(aave.usdc, walletAddress, mintAmount);
    await tx.wait();
    console.log(`done (${tx.hash.slice(0, 14)}...)`);
  } catch (e: any) {
    console.log(`failed: ${e.message?.slice(0, 80)}`);
  }

  // Mint USDT (same amount for dual-token demo)
  try {
    process.stdout.write(`  Aave USDT ${$(mintAmount)} ... `);
    const tx = await faucet.mint(aave.usdt, walletAddress, mintAmount);
    await tx.wait();
    console.log(`done (${tx.hash.slice(0, 14)}...)`);
  } catch (e: any) {
    console.log(`failed: ${e.message?.slice(0, 80)}`);
  }

  // Show updated balances
  const newAaveUsdc = await getBalance(provider, aave.usdc, walletAddress);
  const newAaveUsdt = await getBalance(provider, aave.usdt, walletAddress);

  console.log('\nUpdated Aave balances:');
  console.log(`  Aave USDC: ${$(newAaveUsdc)}`);
  console.log(`  Aave USDT: ${$(newAaveUsdt)}`);
  console.log('\nThe yield router will supply these on the next agent loop cycle.');
}

main().catch(console.error);
