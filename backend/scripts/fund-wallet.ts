#!/usr/bin/env bun
/**
 * Fund the Forage agent wallet with testnet tokens.
 *
 * What this script does:
 * 1. Shows the agent's wallet address
 * 2. Checks current balances (ETH, Circle USDC, Aave USDC, Aave USDT)
 * 3. Calls the Aave faucet contract to mint Aave test USDC and USDT
 * 4. Prints instructions for manual faucets (ETH gas, Circle USDC)
 *
 * Usage:
 *   bun run scripts/fund-wallet.ts              # Check balances + mint Aave tokens
 *   bun run scripts/fund-wallet.ts --mint-only   # Only mint Aave tokens (skip balance check)
 */

import '../dotenv.ts';

import { JsonRpcProvider, Contract, formatUnits, parseUnits } from 'ethers';
import { getEoaWallet, getWalletAddress } from '../src/lib/wdk/index.ts';
import { BASE_SEPOLIA_RPC, USDC_BASE_SEPOLIA } from '../src/config/main-config.ts';
import { AAVE_CONFIG } from '../src/lib/wdk/config.ts';

const FAUCET_ABI = [
  'function mint(address token, address to, uint256 amount) external',
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

async function checkBalance(provider: JsonRpcProvider, tokenAddress: string, walletAddress: string, label: string): Promise<bigint> {
  try {
    const token = new Contract(tokenAddress, ERC20_ABI, provider);
    const balance = await token.balanceOf(walletAddress);
    const decimals = await token.decimals();
    const symbol = await token.symbol().catch(() => label);
    console.log(`  ${label}: ${formatUnits(balance, decimals)} ${symbol}`);
    return BigInt(balance.toString());
  } catch (e) {
    console.log(`  ${label}: error reading balance`);
    return 0n;
  }
}

async function main() {
  const mintOnly = process.argv.includes('--mint-only');
  const provider = new JsonRpcProvider(BASE_SEPOLIA_RPC);
  const walletAddress = await getWalletAddress();
  const aaveConfig = AAVE_CONFIG['base-sepolia'];

  console.log('=== Forage Wallet Funding ===\n');
  console.log(`Wallet address: ${walletAddress}`);
  console.log(`Chain: Base Sepolia (84532)\n`);

  if (!mintOnly) {
    // Check balances
    console.log('Current balances:');
    const ethBalance = await provider.getBalance(walletAddress);
    console.log(`  ETH (gas): ${formatUnits(ethBalance, 18)} ETH`);

    await checkBalance(provider, USDC_BASE_SEPOLIA, walletAddress, 'Circle USDC (payments)');
    const aaveUsdcBal = await checkBalance(provider, aaveConfig.usdc, walletAddress, 'Aave USDC (yield)');
    const aaveUsdtBal = await checkBalance(provider, aaveConfig.usdt, walletAddress, 'Aave USDT (yield)');
    await checkBalance(provider, aaveConfig.aUsdc, walletAddress, 'aUSDC (supplied)');
    await checkBalance(provider, aaveConfig.aUsdt, walletAddress, 'aUSDT (supplied)');
    console.log('');

    // Check if gas is needed
    if (ethBalance < parseUnits('0.001', 18)) {
      console.log('WARNING: Low ETH for gas. Get Base Sepolia ETH from:');
      console.log('  https://faucets.chain.link/base-sepolia\n');
    }
  }

  // Mint Aave test tokens
  console.log('Minting Aave test tokens via faucet...');
  const wallet = await getEoaWallet('base-sepolia');
  const faucet = new Contract(aaveConfig.faucet, FAUCET_ABI, wallet);

  const mintAmount = parseUnits('1000', 6); // 1000 USDC/USDT (6 decimals)

  try {
    console.log(`  Minting 1000 Aave USDC to ${walletAddress}...`);
    const tx1 = await faucet.mint(aaveConfig.usdc, walletAddress, mintAmount);
    console.log(`  TX: ${tx1.hash}`);
    await tx1.wait();
    console.log('  Aave USDC minted.');
  } catch (e: any) {
    console.log(`  Aave USDC mint failed: ${e.message?.slice(0, 100)}`);
  }

  try {
    console.log(`  Minting 1000 Aave USDT to ${walletAddress}...`);
    const tx2 = await faucet.mint(aaveConfig.usdt, walletAddress, mintAmount);
    console.log(`  TX: ${tx2.hash}`);
    await tx2.wait();
    console.log('  Aave USDT minted.');
  } catch (e: any) {
    console.log(`  Aave USDT mint failed: ${e.message?.slice(0, 100)}`);
  }

  // Post-mint balances
  console.log('\nPost-mint balances:');
  await checkBalance(provider, aaveConfig.usdc, walletAddress, 'Aave USDC');
  await checkBalance(provider, aaveConfig.usdt, walletAddress, 'Aave USDT');

  console.log('\n--- Manual faucets (if needed) ---');
  console.log('Base Sepolia ETH:   https://faucets.chain.link/base-sepolia');
  console.log('Circle USDC:        https://faucet.circle.com/');
  console.log('Aave faucet UI:     https://app.aave.com/faucet/');
  console.log(`\nPaste this address: ${walletAddress}`);
}

main().catch(console.error);
