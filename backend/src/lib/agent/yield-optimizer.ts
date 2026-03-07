import { Contract, Interface, JsonRpcProvider } from 'ethers';
import { getAccount } from '../wdk/index.ts';
import { AAVE_CONFIG, CHAINS, isAaveAvailable, type AaveChainKey, type ChainKey } from '../wdk/config.ts';
import { prismaQuery } from '../prisma.ts';
import { type AgentStateType, getStateConfig } from './state-machine.ts';

// Aave V3 Pool ABI (only the methods we need)
const POOL_ABI = [
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external',
  'function withdraw(address asset, uint256 amount, address to) external returns (uint256)',
  'function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
];

// ERC-20 ABI for approve + balanceOf
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
];

export interface YieldPosition {
  chain: ChainKey;
  protocol: string;
  supplied: bigint;
  apy: number;
}

const EMPTY_POSITIONS = { totalCollateral: 0n, totalDebt: 0n, healthFactor: 0n };

function getPoolInterface(): Interface {
  return new Interface(POOL_ABI);
}

function getErc20Interface(): Interface {
  return new Interface(ERC20_ABI);
}

export async function getAavePositions(chain: ChainKey = 'base-sepolia'): Promise<{
  totalCollateral: bigint;
  totalDebt: bigint;
  healthFactor: bigint;
}> {
  if (!isAaveAvailable(chain)) return EMPTY_POSITIONS;

  try {
    const aaveConfig = AAVE_CONFIG[chain as AaveChainKey];
    const provider = new JsonRpcProvider(CHAINS[chain].provider);
    const pool = new Contract(aaveConfig.pool, POOL_ABI, provider);

    const account = await getAccount(chain);
    const address = await account.getAddress();

    const data = await pool.getUserAccountData(address);

    return {
      totalCollateral: data.totalCollateralBase,
      totalDebt: data.totalDebtBase,
      healthFactor: data.healthFactor,
    };
  } catch (error) {
    console.error('[YieldOptimizer] Failed to get Aave positions:', error);
    return EMPTY_POSITIONS;
  }
}

// Get Aave testnet USDC balance
export async function getAaveUsdcBalance(chain: ChainKey = 'base-sepolia'): Promise<bigint> {
  if (!isAaveAvailable(chain)) return 0n;

  try {
    const aaveConfig = AAVE_CONFIG[chain as AaveChainKey];
    const provider = new JsonRpcProvider(CHAINS[chain].provider);
    const usdc = new Contract(aaveConfig.usdc, ERC20_ABI, provider);

    const account = await getAccount(chain);
    const address = await account.getAddress();
    const balance = await usdc.balanceOf(address);
    return BigInt(balance.toString());
  } catch {
    return 0n;
  }
}

// Get aUSDC balance (how much is supplied to Aave)
export async function getAaveSuppliedBalance(chain: ChainKey = 'base-sepolia'): Promise<bigint> {
  if (!isAaveAvailable(chain)) return 0n;

  try {
    const aaveConfig = AAVE_CONFIG[chain as AaveChainKey];
    const provider = new JsonRpcProvider(CHAINS[chain].provider);
    const aUsdc = new Contract(aaveConfig.aUsdc, ERC20_ABI, provider);

    const account = await getAccount(chain);
    const address = await account.getAddress();
    const balance = await aUsdc.balanceOf(address);
    return BigInt(balance.toString());
  } catch {
    return 0n;
  }
}

export async function supplyToAave(
  amount: bigint,
  chain: ChainKey = 'base-sepolia',
): Promise<{ hash: string; fee: bigint } | null> {
  if (!isAaveAvailable(chain)) {
    console.log('[YieldOptimizer] Aave not available on this chain');
    return null;
  }

  try {
    const aaveConfig = AAVE_CONFIG[chain as AaveChainKey];
    const account = await getAccount(chain);
    const address = await account.getAddress();
    const poolIface = getPoolInterface();
    const erc20Iface = getErc20Interface();

    // 1. Check allowance and approve if needed
    const provider = new JsonRpcProvider(CHAINS[chain].provider);
    const usdc = new Contract(aaveConfig.usdc, ERC20_ABI, provider);
    const currentAllowance = await usdc.allowance(address, aaveConfig.pool);

    if (BigInt(currentAllowance.toString()) < amount) {
      console.log('[YieldOptimizer] Approving USDC spend for Aave Pool...');
      const approveData = erc20Iface.encodeFunctionData('approve', [aaveConfig.pool, amount]);
      await (account as any).sendTransaction({ to: aaveConfig.usdc, data: approveData, value: 0n });
    }

    // 2. Supply to Aave Pool
    console.log(`[YieldOptimizer] Supplying ${Number(amount) / 1e6} USDC to Aave on ${chain}`);
    const supplyData = poolIface.encodeFunctionData('supply', [
      aaveConfig.usdc, // asset
      amount,          // amount
      address,         // onBehalfOf
      0,               // referralCode
    ]);

    const result = await (account as any).sendTransaction({
      to: aaveConfig.pool,
      data: supplyData,
      value: 0n,
    });

    // Log the transaction
    await prismaQuery.agentTransaction.create({
      data: {
        type: 'AAVE_SUPPLY',
        amount,
        token: 'USDC',
        chain,
        txHash: result.hash,
        description: `Supplied ${Number(amount) / 1e6} USDC to Aave V3`,
      },
    });

    console.log(`[YieldOptimizer] Supply tx: ${result.hash}`);
    return { hash: result.hash, fee: result.fee || 0n };
  } catch (error) {
    console.error('[YieldOptimizer] Supply failed:', error);
    return null;
  }
}

export async function withdrawFromAave(
  amount: bigint,
  chain: ChainKey = 'base-sepolia',
): Promise<{ hash: string; fee: bigint } | null> {
  if (!isAaveAvailable(chain)) {
    console.log('[YieldOptimizer] Aave not available on this chain');
    return null;
  }

  try {
    const aaveConfig = AAVE_CONFIG[chain as AaveChainKey];
    const account = await getAccount(chain);
    const address = await account.getAddress();
    const poolIface = getPoolInterface();

    console.log(`[YieldOptimizer] Withdrawing ${Number(amount) / 1e6} USDC from Aave on ${chain}`);
    const withdrawData = poolIface.encodeFunctionData('withdraw', [
      aaveConfig.usdc,                       // asset
      amount,                                // amount (use MaxUint256 for all)
      address,                               // to
    ]);

    const result = await (account as any).sendTransaction({
      to: aaveConfig.pool,
      data: withdrawData,
      value: 0n,
    });

    await prismaQuery.agentTransaction.create({
      data: {
        type: 'AAVE_WITHDRAW',
        amount,
        token: 'USDC',
        chain,
        txHash: result.hash,
        description: `Withdrew ${Number(amount) / 1e6} USDC from Aave V3`,
      },
    });

    console.log(`[YieldOptimizer] Withdraw tx: ${result.hash}`);
    return { hash: result.hash, fee: result.fee || 0n };
  } catch (error) {
    console.error('[YieldOptimizer] Withdraw failed:', error);
    return null;
  }
}

export async function optimizeYield(
  state: AgentStateType,
  liquidBalance: bigint,
  monthlyBurn: bigint,
): Promise<void> {
  const config = getStateConfig(state);

  if (config.shouldWithdrawAave) {
    // Withdraw everything when desperate/critical
    const supplied = await getAaveSuppliedBalance();
    if (supplied > 0n) {
      console.log('[YieldOptimizer] State is', state, '- withdrawing all from Aave');
      await withdrawFromAave(supplied);
    }
    return;
  }

  if (config.shouldSupplyAave) {
    // Check if we have Aave testnet USDC to supply
    const aaveUsdcBalance = await getAaveUsdcBalance();
    if (aaveUsdcBalance <= 1_000_000n) {
      console.log(`[YieldOptimizer] Aave USDC balance too low (${Number(aaveUsdcBalance) / 1e6}), skipping supply`);
      return;
    }

    // Supply surplus (keep 2x monthly burn as reserve, supply rest)
    const reserve = monthlyBurn * 2n;
    const surplus = aaveUsdcBalance - reserve;

    if (surplus > 1_000_000n) { // Only supply if surplus > $1
      console.log(`[YieldOptimizer] Supplying surplus of ${Number(surplus) / 1e6} USDC to Aave`);
      await supplyToAave(surplus);
    }
  }
}
