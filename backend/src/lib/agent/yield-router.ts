import { Contract, Interface, JsonRpcProvider, MaxUint256 } from 'ethers';
import {
  CHAINS,
  AAVE_CONFIG,
  COMPOUND_CONFIG,
  MORPHO_CONFIG,
  MORPHO_MARKET_ID,
  YIELD_CHAIN,
  type ChainKey,
  type AaveChainKey,
  type CompoundChainKey,
  type MorphoChainKey,
} from '../wdk/config.ts';
import { get4337Account, getAccount, getEoaWallet, getEoaAddress } from '../wdk/index.ts';
import { prismaQuery } from '../prisma.ts';
import { queryAllRates } from './yield-rates.ts';
import {
  AAVE_POOL_ABI,
  COMPOUND_COMET_ABI,
  MORPHO_ABI,
  ERC20_ABI,
  PROTOCOL_CONFIGS,
  MIN_APY_DIFF,
  MIN_SUPPLY_AMOUNT,
  GAS_SAFETY_MULTIPLIER,
  type ProtocolId,
  type RateSnapshot,
  type YieldPosition,
  type YieldToken,
} from './yield-config.ts';
import { type AgentStateType, getStateConfig } from './state-machine.ts';
import { AGENT_MAX_TX_AMOUNT } from '../../config/main-config.ts';

const MAX_TX = BigInt(AGENT_MAX_TX_AMOUNT);

// --- Position Queries ---

async function getAavePosition(chain: ChainKey): Promise<bigint> {
  if (!(chain in AAVE_CONFIG)) return 0n;
  try {
    const config = AAVE_CONFIG[chain as AaveChainKey];
    const provider = new JsonRpcProvider(CHAINS[chain].provider);
    const address = await getEoaAddress();

    if (config.aUsdc) {
      const aUsdc = new Contract(config.aUsdc, ERC20_ABI, provider);
      const balance = await aUsdc.balanceOf(address);
      return BigInt(balance.toString());
    }

    const pool = new Contract(config.pool, AAVE_POOL_ABI, provider);
    const data = await pool.getUserAccountData(address);
    return BigInt(data.totalCollateralBase.toString());
  } catch {
    return 0n;
  }
}

async function getAaveUsdtPosition(chain: ChainKey): Promise<bigint> {
  if (!(chain in AAVE_CONFIG)) return 0n;
  try {
    const config = AAVE_CONFIG[chain as AaveChainKey];
    if (!config.aUsdt) return 0n;

    const provider = new JsonRpcProvider(CHAINS[chain].provider);
    const address = await getEoaAddress();
    const aUsdt = new Contract(config.aUsdt, ERC20_ABI, provider);
    const balance = await aUsdt.balanceOf(address);
    return BigInt(balance.toString());
  } catch {
    return 0n;
  }
}

async function getCompoundPosition(chain: ChainKey): Promise<bigint> {
  if (!(chain in COMPOUND_CONFIG)) return 0n;
  try {
    const config = COMPOUND_CONFIG[chain as CompoundChainKey];
    const provider = new JsonRpcProvider(CHAINS[chain].provider);
    const comet = new Contract(config.comet, COMPOUND_COMET_ABI, provider);
    const address = await getEoaAddress();
    const balance = await comet.balanceOf(address);
    return BigInt(balance.toString());
  } catch {
    return 0n;
  }
}

async function getMorphoPosition(chain: ChainKey, marketId: string): Promise<bigint> {
  if (!(chain in MORPHO_CONFIG) || !marketId) return 0n;
  try {
    const config = MORPHO_CONFIG[chain as MorphoChainKey];
    const provider = new JsonRpcProvider(CHAINS[chain].provider);
    const morpho = new Contract(config.morpho, MORPHO_ABI, provider);
    const address = await getEoaAddress();
    const position = await morpho.position(marketId, address);
    return BigInt(position.supplyShares.toString());
  } catch {
    return 0n;
  }
}

/**
 * Get all current yield positions across protocols.
 */
export async function getAllPositions(morphoMarketId: string = MORPHO_MARKET_ID): Promise<YieldPosition[]> {
  const positions: YieldPosition[] = [];

  const [aaveEth, aaveBase, aaveUsdtEth, aaveUsdtBase, compound, morpho] = await Promise.allSettled([
    getAavePosition('ethereum-sepolia'),
    getAavePosition('base-sepolia'),
    getAaveUsdtPosition('ethereum-sepolia'),
    getAaveUsdtPosition('base-sepolia'),
    getCompoundPosition('ethereum-sepolia'),
    morphoMarketId ? getMorphoPosition('ethereum-sepolia', morphoMarketId) : Promise.resolve(0n),
  ]);

  const add = (protocol: ProtocolId, chain: ChainKey, result: PromiseSettledResult<bigint>) => {
    const supplied = result.status === 'fulfilled' ? result.value : 0n;
    if (supplied > 0n) {
      const config = PROTOCOL_CONFIGS[protocol];
      positions.push({
        protocol,
        chain,
        supplied,
        apy: 0,
        riskScore: config.riskScore,
        token: config.token,
        tokenVariant: config.tokenVariant,
      });
    }
  };

  add('aave-v3', 'ethereum-sepolia', aaveEth);
  add('aave-v3', 'base-sepolia', aaveBase);
  add('aave-v3-usdt', 'ethereum-sepolia', aaveUsdtEth);
  add('aave-v3-usdt', 'base-sepolia', aaveUsdtBase);
  add('compound-v3', 'ethereum-sepolia', compound);
  if (morphoMarketId) add('morpho-blue', 'ethereum-sepolia', morpho);

  return positions;
}

// --- 4337 Batched Operations ---

const POOL_IFACE = new Interface([
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external',
  'function withdraw(address asset, uint256 amount, address to) external returns (uint256)',
]);

const ERC20_IFACE = new Interface([
  'function approve(address spender, uint256 amount) external returns (bool)',
]);

/**
 * Supply to Aave via 4337 Smart Account with batched approve+supply in one UserOperation.
 * This is atomic: both approve and supply execute together or both revert.
 * Returns null if 4337 fails (caller should fall back to EOA).
 */
async function supplyVia4337Batch(
  protocol: 'aave-v3' | 'aave-v3-usdt',
  amount: bigint,
  chain: ChainKey,
): Promise<{ hash: string; fee: bigint } | null> {
  try {
    const config = AAVE_CONFIG[chain as AaveChainKey];
    if (!config) return null;

    const account = await get4337Account();
    const address = await account.getAddress();
    const tokenAddress = protocol === 'aave-v3-usdt' ? config.usdt : config.usdc;
    const tokenSymbol = protocol === 'aave-v3-usdt' ? 'USDT' : 'USDC';

    console.log(`[YieldRouter] 4337 batch: approve+supply ${Number(amount) / 1e6} ${tokenSymbol} to Aave on ${chain} via Safe ${address}`);

    // Encode approve(pool, amount) and supply(token, amount, onBehalfOf, 0)
    const approveTx = {
      to: tokenAddress,
      data: ERC20_IFACE.encodeFunctionData('approve', [config.pool, amount]),
      value: 0n,
    };
    const supplyTx = {
      to: config.pool,
      data: POOL_IFACE.encodeFunctionData('supply', [tokenAddress, amount, address, 0]),
      value: 0n,
    };

    // Batch both into a single UserOperation
    const result = await (account as any).sendTransaction([approveTx, supplyTx]);

    console.log(`[YieldRouter] 4337 batch tx: ${result.hash} (fee: ${result.fee})`);
    return { hash: result.hash, fee: result.fee || 0n };
  } catch (error: any) {
    console.log(`[YieldRouter] 4337 batch failed (will fall back to EOA): ${error.message?.slice(0, 120)}`);
    return null;
  }
}

/**
 * Withdraw from Aave via 4337 Smart Account.
 * Returns null if 4337 fails (caller should fall back to EOA).
 */
async function withdrawVia4337(
  protocol: 'aave-v3' | 'aave-v3-usdt',
  amount: bigint,
  chain: ChainKey,
): Promise<{ hash: string; fee: bigint } | null> {
  try {
    const config = AAVE_CONFIG[chain as AaveChainKey];
    if (!config) return null;

    const account = await get4337Account();
    const address = await account.getAddress();
    const tokenAddress = protocol === 'aave-v3-usdt' ? config.usdt : config.usdc;

    const withdrawTx = {
      to: config.pool,
      data: POOL_IFACE.encodeFunctionData('withdraw', [tokenAddress, amount, address]),
      value: 0n,
    };

    const result = await (account as any).sendTransaction(withdrawTx);
    console.log(`[YieldRouter] 4337 withdraw tx: ${result.hash}`);
    return { hash: result.hash, fee: result.fee || 0n };
  } catch (error: any) {
    console.log(`[YieldRouter] 4337 withdraw failed (will fall back to EOA): ${error.message?.slice(0, 120)}`);
    return null;
  }
}

// --- Supply / Withdraw Operations ---

/**
 * Supply to a protocol. For Aave, tries 4337 batched approve+supply first (atomic, single UserOp).
 * Falls back to EOA with separate transactions if 4337 fails.
 */
async function supplyToProtocol(
  protocol: ProtocolId,
  amount: bigint,
  chain: ChainKey = YIELD_CHAIN,
): Promise<{ hash: string; fee: bigint } | null> {
  // Guard 1: Max transaction amount ($10)
  if (amount > MAX_TX) {
    console.log(`[YieldRouter] BLOCKED: Supply amount $${Number(amount) / 1e6} exceeds max $${Number(MAX_TX) / 1e6}. Capping.`);
    amount = MAX_TX;
  }

  try {
    const wallet = await getEoaWallet(chain);
    const address = wallet.address;

    let tokenAddress: string;
    let spenderAddress: string;
    const tokenSymbol = PROTOCOL_CONFIGS[protocol].token;

    if (protocol === 'aave-v3' && chain in AAVE_CONFIG) {
      const config = AAVE_CONFIG[chain as AaveChainKey];
      tokenAddress = config.usdc;
      spenderAddress = config.pool;
    } else if (protocol === 'aave-v3-usdt' && chain in AAVE_CONFIG) {
      const config = AAVE_CONFIG[chain as AaveChainKey];
      tokenAddress = config.usdt;
      spenderAddress = config.pool;
    } else if (protocol === 'compound-v3' && chain in COMPOUND_CONFIG) {
      const config = COMPOUND_CONFIG[chain as CompoundChainKey];
      tokenAddress = config.usdc;
      spenderAddress = config.comet;
    } else if (protocol === 'morpho-blue' && chain in MORPHO_CONFIG) {
      const config = MORPHO_CONFIG[chain as MorphoChainKey];
      tokenAddress = config.usdc;
      spenderAddress = config.morpho;
    } else {
      console.log(`[YieldRouter] Protocol ${protocol} not available on ${chain}`);
      return null;
    }

    console.log(`[YieldRouter] Supplying ${Number(amount) / 1e6} ${tokenSymbol} to ${protocol} on ${chain}`);

    // Try 4337 batched approve+supply for Aave (atomic, single UserOperation)
    if ((protocol === 'aave-v3' || protocol === 'aave-v3-usdt') && chain === YIELD_CHAIN) {
      const batchResult = await supplyVia4337Batch(protocol, amount, chain);
      if (batchResult) {
        await prismaQuery.agentTransaction.create({
          data: {
            type: 'AAVE_SUPPLY',
            amount,
            token: tokenSymbol,
            chain,
            txHash: batchResult.hash,
            description: `Supplied ${Number(amount) / 1e6} ${tokenSymbol} to ${PROTOCOL_CONFIGS[protocol].name} via 4337 batch`,
            metadata: JSON.stringify({ protocol, chain, token: tokenSymbol, method: '4337-batch' }),
          },
        });
        return batchResult;
      }
      console.log(`[YieldRouter] Falling back to EOA for ${protocol} supply`);
    }

    // EOA fallback: separate approve + supply transactions
    // Step 1: Approve (use MaxUint256; reset to 0 first for USDT-like tokens)
    const token = new Contract(tokenAddress, ERC20_ABI, wallet);
    const currentAllowance = await token.allowance(address, spenderAddress);
    if (BigInt(currentAllowance.toString()) < amount) {
      if (BigInt(currentAllowance.toString()) > 0n) {
        const resetTx = await token.approve(spenderAddress, 0);
        await resetTx.wait();
      }
      const approveTx = await token.approve(spenderAddress, MaxUint256);
      await approveTx.wait();
      console.log(`[YieldRouter] Approved: ${approveTx.hash}`);
    }

    // Step 2: Supply
    let supplyTx;
    if (protocol === 'aave-v3' || protocol === 'aave-v3-usdt') {
      const pool = new Contract(spenderAddress, AAVE_POOL_ABI, wallet);
      supplyTx = await pool.supply(tokenAddress, amount, address, 0);
    } else if (protocol === 'morpho-blue') {
      const config = MORPHO_CONFIG[chain as MorphoChainKey];
      const morpho = new Contract(config.morpho, MORPHO_ABI, wallet);
      // Fetch market params on-chain using the stored market ID
      const marketId = config.marketId;
      if (!marketId) {
        console.log(`[YieldRouter] Morpho Blue: no marketId configured for ${chain}`);
        return null;
      }
      const params = await morpho.idToMarketParams(marketId);
      const marketParams = [params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv];
      // supply(marketParams, assets, shares=0, onBehalf, data=0x)
      supplyTx = await morpho.supply(marketParams, amount, 0, address, '0x');
    } else {
      const comet = new Contract(spenderAddress, COMPOUND_COMET_ABI, wallet);
      supplyTx = await comet.supply(tokenAddress, amount);
    }
    const receipt = await supplyTx.wait();
    const fee = BigInt(receipt.gasUsed || 0) * BigInt(receipt.gasPrice || 0);

    // Log transaction
    await prismaQuery.agentTransaction.create({
      data: {
        type: (protocol === 'aave-v3' || protocol === 'aave-v3-usdt') ? 'AAVE_SUPPLY' : 'DEFI_SUPPLY',
        amount,
        token: tokenSymbol,
        chain,
        txHash: supplyTx.hash,
        description: `Supplied ${Number(amount) / 1e6} ${tokenSymbol} to ${PROTOCOL_CONFIGS[protocol].name}`,
        metadata: JSON.stringify({ protocol, chain, token: tokenSymbol }),
      },
    });

    console.log(`[YieldRouter] Supply tx: ${supplyTx.hash}`);
    return { hash: supplyTx.hash, fee };
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const shortErr = errMsg.slice(0, 200);
    if (errMsg.includes('51') || errMsg.includes('SUPPLY_CAP_EXCEEDED') || errMsg.includes('supply cap')) {
      console.log(`[YieldRouter] Supply to ${protocol} on ${chain}: SUPPLY_CAP_EXCEEDED. Skipping.`);
    } else if (errMsg.includes('NUMERIC_FAULT')) {
      console.log(`[YieldRouter] Supply to ${protocol} on ${chain}: NUMERIC_FAULT (ethers encoding). Amount: ${amount}, token: ${PROTOCOL_CONFIGS[protocol].token}`);
    } else {
      console.error(`[YieldRouter] Supply to ${protocol} on ${chain} failed: ${shortErr}`);
    }
    return null;
  }
}

/**
 * Withdraw USDC from a protocol using raw EOA wallet.
 */
async function withdrawFromProtocol(
  protocol: ProtocolId,
  amount: bigint,
  chain: ChainKey = YIELD_CHAIN,
): Promise<{ hash: string; fee: bigint } | null> {
  // Guard 1: Max transaction amount ($10) for withdrawals too
  if (amount > MAX_TX) {
    console.log(`[YieldRouter] BLOCKED: Withdraw amount $${Number(amount) / 1e6} exceeds max $${Number(MAX_TX) / 1e6}. Capping.`);
    amount = MAX_TX;
  }

  try {
    const wallet = await getEoaWallet(chain);
    const address = wallet.address;

    const tokenSymbol = PROTOCOL_CONFIGS[protocol].token;
    console.log(`[YieldRouter] Withdrawing ${Number(amount) / 1e6} ${tokenSymbol} from ${protocol} on ${chain}`);

    // Try 4337 for Aave on yield chain
    if ((protocol === 'aave-v3' || protocol === 'aave-v3-usdt') && chain === YIELD_CHAIN) {
      const result4337 = await withdrawVia4337(protocol, amount, chain);
      if (result4337) {
        await prismaQuery.agentTransaction.create({
          data: {
            type: 'AAVE_WITHDRAW',
            amount,
            token: tokenSymbol,
            chain,
            txHash: result4337.hash,
            description: `Withdrew ${Number(amount) / 1e6} ${tokenSymbol} from ${PROTOCOL_CONFIGS[protocol].name} via 4337`,
            metadata: JSON.stringify({ protocol, chain, token: tokenSymbol, method: '4337' }),
          },
        });
        return result4337;
      }
      console.log(`[YieldRouter] Falling back to EOA for ${protocol} withdraw`);
    }

    let withdrawTx;
    if (protocol === 'aave-v3' && chain in AAVE_CONFIG) {
      const config = AAVE_CONFIG[chain as AaveChainKey];
      const pool = new Contract(config.pool, AAVE_POOL_ABI, wallet);
      withdrawTx = await pool.withdraw(config.usdc, amount, address);
    } else if (protocol === 'aave-v3-usdt' && chain in AAVE_CONFIG) {
      const config = AAVE_CONFIG[chain as AaveChainKey];
      const pool = new Contract(config.pool, AAVE_POOL_ABI, wallet);
      withdrawTx = await pool.withdraw(config.usdt, amount, address);
    } else if (protocol === 'compound-v3' && chain in COMPOUND_CONFIG) {
      const config = COMPOUND_CONFIG[chain as CompoundChainKey];
      const comet = new Contract(config.comet, COMPOUND_COMET_ABI, wallet);
      withdrawTx = await comet.withdraw(config.usdc, amount);
    } else if (protocol === 'morpho-blue' && chain in MORPHO_CONFIG) {
      const config = MORPHO_CONFIG[chain as MorphoChainKey];
      const morpho = new Contract(config.morpho, MORPHO_ABI, wallet);
      const marketId = config.marketId;
      if (!marketId) {
        console.log(`[YieldRouter] Morpho Blue: no marketId configured for ${chain}`);
        return null;
      }
      const params = await morpho.idToMarketParams(marketId);
      const marketParams = [params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv];
      // withdraw(marketParams, assets, shares=0, onBehalf, receiver)
      withdrawTx = await morpho.withdraw(marketParams, amount, 0, address, address);
    } else {
      console.log(`[YieldRouter] Protocol ${protocol} not available on ${chain}`);
      return null;
    }

    const receipt = await withdrawTx.wait();
    const fee = BigInt(receipt.gasUsed || 0) * BigInt(receipt.gasPrice || 0);

    await prismaQuery.agentTransaction.create({
      data: {
        type: (protocol === 'aave-v3' || protocol === 'aave-v3-usdt') ? 'AAVE_WITHDRAW' : 'DEFI_WITHDRAW',
        amount,
        token: tokenSymbol,
        chain,
        txHash: withdrawTx.hash,
        description: `Withdrew ${Number(amount) / 1e6} ${tokenSymbol} from ${PROTOCOL_CONFIGS[protocol].name}`,
        metadata: JSON.stringify({ protocol, chain, token: tokenSymbol }),
      },
    });

    console.log(`[YieldRouter] Withdraw tx: ${withdrawTx.hash}`);
    return { hash: withdrawTx.hash, fee };
  } catch (error) {
    console.error(`[YieldRouter] Withdraw from ${protocol} failed:`, error);
    return null;
  }
}

// --- Router Logic ---

export interface RouterDecision {
  action: 'HOLD' | 'SUPPLY' | 'WITHDRAW_ALL' | 'REBALANCE';
  protocol?: ProtocolId;
  chain?: ChainKey;
  amount?: bigint;
  token?: YieldToken;
  reasoning: string;
  rates: RateSnapshot[];
}

/**
 * Get the token address for a protocol on a given chain.
 */
function getTokenAddress(protocol: ProtocolId, chain: ChainKey): string | null {
  if (protocol === 'aave-v3' && chain in AAVE_CONFIG) return AAVE_CONFIG[chain as AaveChainKey].usdc;
  if (protocol === 'aave-v3-usdt' && chain in AAVE_CONFIG) return AAVE_CONFIG[chain as AaveChainKey].usdt;
  if (protocol === 'compound-v3' && chain in COMPOUND_CONFIG) return COMPOUND_CONFIG[chain as CompoundChainKey].usdc;
  if (protocol === 'morpho-blue' && chain in MORPHO_CONFIG) return MORPHO_CONFIG[chain as MorphoChainKey].usdc;
  return null;
}

/**
 * Route yield for a single token (USDC or USDT).
 * Filters rates and positions to only this token, then decides supply/rebalance/hold.
 */
async function routeYieldForToken(
  tokenType: YieldToken,
  state: AgentStateType,
  liquidBalance: bigint,
  monthlyBurn: bigint,
  allRates: RateSnapshot[],
  allPositions: YieldPosition[],
): Promise<RouterDecision> {
  const rates = allRates.filter(r => r.token === tokenType);
  const positions = allPositions.filter(p => p.token === tokenType);

  const stateConfig = getStateConfig(state);

  if (!stateConfig.shouldSupplyAave) {
    return { action: 'HOLD', reasoning: `[${tokenType}] State is ${state}. Not supplying.`, rates };
  }

  const best = rates[0]; // Already sorted
  if (!best || best.apy <= 0) {
    return { action: 'HOLD', reasoning: `[${tokenType}] No positive yields available.`, rates };
  }

  const currentPosition = positions.find(p => p.supplied > 0n);

  // If already in a position for this token, check rebalance
  if (currentPosition) {
    const currentRate = rates.find(
      r => r.protocol === currentPosition.protocol && r.chain === currentPosition.chain,
    );
    const currentRiskAdj = currentRate?.riskAdjustedApy || 0;

    if (best.riskAdjustedApy - currentRiskAdj < MIN_APY_DIFF) {
      // Already in best protocol. Check if we have earned surplus to add.
      // Use liquidBalance (Circle USDC from earnings) as the cap, NOT the Aave token balance.
      // On testnet, Aave uses separate faucet tokens. We only supply what the agent actually earned.
      const reserve = tokenType === 'USDC' ? monthlyBurn * 2n : 0n;
      const earnedSurplus = liquidBalance > reserve ? liquidBalance - reserve : 0n;

      if (earnedSurplus >= MIN_SUPPLY_AMOUNT) {
        // Verify we have enough Aave tokens to cover the earned surplus
        const tokenAddr = getTokenAddress(currentPosition.protocol, currentPosition.chain);
        if (tokenAddr) {
          try {
            const provider = new JsonRpcProvider(CHAINS[currentPosition.chain].provider);
            const tokenContract = new Contract(tokenAddr, ERC20_ABI, provider);
            const eoaAddr = await getEoaAddress();
            const aaveTokenBalance = BigInt((await tokenContract.balanceOf(eoaAddr)).toString());

            // Supply the smaller of: earned surplus or available Aave tokens
            const supplyAmount = earnedSurplus < aaveTokenBalance ? earnedSurplus : aaveTokenBalance;

            if (supplyAmount >= MIN_SUPPLY_AMOUNT) {
              console.log(`[YieldRouter] [${tokenType}] Adding ${Number(supplyAmount) / 1e6} surplus to existing ${currentPosition.protocol} position (earned: ${Number(liquidBalance) / 1e6}, reserve: ${Number(reserve) / 1e6})`);
              const result = await supplyToProtocol(currentPosition.protocol, supplyAmount, currentPosition.chain);
              if (result) {
                return {
                  action: 'SUPPLY',
                  protocol: currentPosition.protocol,
                  chain: currentPosition.chain,
                  amount: supplyAmount,
                  token: tokenType,
                  reasoning: `[${tokenType}] Added ${Number(supplyAmount) / 1e6} to existing ${currentPosition.protocol} position at ${(currentRiskAdj * 100).toFixed(2)}% APY.`,
                  rates,
                };
              }
            }
          } catch (err) {
            console.error(`[YieldRouter] [${tokenType}] Surplus supply check failed:`, String(err).slice(0, 150));
          }
        }
      }

      return {
        action: 'HOLD',
        reasoning: `[${tokenType}] Position in ${currentPosition.protocol} (${(currentRiskAdj * 100).toFixed(2)}%) near best. Holding.`,
        rates,
      };
    }

    // Same token variant check
    if (PROTOCOL_CONFIGS[currentPosition.protocol].tokenVariant !== PROTOCOL_CONFIGS[best.protocol].tokenVariant) {
      return {
        action: 'HOLD',
        reasoning: `[${tokenType}] Best ${best.protocol} requires different token variant. Holding.`,
        rates,
      };
    }

    // Gas guard
    const apyDiff = best.riskAdjustedApy - currentRiskAdj;
    const principalUsd = Number(currentPosition.supplied) / 1e6;
    const projectedGainUsd = principalUsd * apyDiff * (30 / 365);
    const estimatedGasCostUsd = 0.002 * 2500;
    if (projectedGainUsd < estimatedGasCostUsd * GAS_SAFETY_MULTIPLIER) {
      return {
        action: 'HOLD',
        reasoning: `[${tokenType}] Gas guard: 30d gain $${projectedGainUsd.toFixed(4)} < threshold. Not rebalancing.`,
        rates,
      };
    }

    console.log(`[YieldRouter] [${tokenType}] Rebalancing from ${currentPosition.protocol} to ${best.protocol}`);
    await withdrawFromProtocol(currentPosition.protocol, currentPosition.supplied, currentPosition.chain);
    await supplyToProtocol(best.protocol, currentPosition.supplied, best.chain);

    return {
      action: 'REBALANCE',
      protocol: best.protocol,
      chain: best.chain,
      amount: currentPosition.supplied,
      token: tokenType,
      reasoning: `[${tokenType}] Rebalanced to ${best.protocol} at ${(best.riskAdjustedApy * 100).toFixed(2)}%.`,
      rates,
    };
  }

  // No position: try to supply surplus
  // Cap by earned balance (liquidBalance), not raw Aave token balance from faucet.
  const reserve = tokenType === 'USDC' ? monthlyBurn * 2n : 0n;
  const earnedSurplus = liquidBalance > reserve ? liquidBalance - reserve : 0n;

  if (earnedSurplus < MIN_SUPPLY_AMOUNT) {
    return { action: 'HOLD', reasoning: `[${tokenType}] Earned surplus $${Number(earnedSurplus) / 1e6} below minimum. Holding.`, rates };
  }

  // Try each candidate, verify Aave token availability
  const sortedRates = [...rates].filter(r => r.apy > 0);
  for (const candidate of sortedRates) {
    const tokenAddr = getTokenAddress(candidate.protocol, candidate.chain);
    if (!tokenAddr) continue;

    let candidateBalance: bigint;
    try {
      const provider = new JsonRpcProvider(CHAINS[candidate.chain].provider);
      const tokenContract = new Contract(tokenAddr, ERC20_ABI, provider);
      const eoaAddr = await getEoaAddress();
      candidateBalance = BigInt((await tokenContract.balanceOf(eoaAddr)).toString());
    } catch {
      candidateBalance = 0n;
    }

    // Supply the smaller of: earned surplus or available Aave tokens
    const supplyAmount = earnedSurplus < candidateBalance ? earnedSurplus : candidateBalance;
    if (supplyAmount < MIN_SUPPLY_AMOUNT) continue;
    console.log(`[YieldRouter] [${tokenType}] Supplying ${Number(supplyAmount) / 1e6} (earned surplus, capped by Aave token balance ${Number(candidateBalance) / 1e6})`);

    const result = await supplyToProtocol(candidate.protocol, supplyAmount, candidate.chain);
    if (result) {
      return {
        action: 'SUPPLY',
        protocol: candidate.protocol,
        chain: candidate.chain,
        amount: supplyAmount,
        token: tokenType,
        reasoning: `[${tokenType}] Supplied ${Number(supplyAmount) / 1e6} ${tokenType} to ${candidate.protocol} at ${(candidate.riskAdjustedApy * 100).toFixed(2)}% APY.`,
        rates,
      };
    }
    console.log(`[YieldRouter] [${tokenType}] Supply to ${candidate.protocol} failed, trying next...`);
  }

  return { action: 'HOLD', reasoning: `[${tokenType}] No supply succeeded or insufficient balance.`, rates };
}

/**
 * Main yield router: routes both USDC and USDT independently.
 * Returns combined results.
 */
export async function routeYield(
  state: AgentStateType,
  liquidBalance: bigint,
  monthlyBurn: bigint,
  morphoMarketId: string = MORPHO_MARKET_ID,
): Promise<RouterDecision> {
  const stateConfig = getStateConfig(state);

  // Emergency: withdraw everything (both tokens)
  if (stateConfig.shouldWithdrawAave) {
    const positions = await getAllPositions(morphoMarketId);
    for (const pos of positions) {
      if (pos.supplied > 0n) {
        await withdrawFromProtocol(pos.protocol, pos.supplied, pos.chain);
      }
    }
    return {
      action: 'WITHDRAW_ALL',
      reasoning: `State is ${state}. Withdrawing all yield positions (USDC + USDT) for survival.`,
      rates: [],
    };
  }

  // Query rates across all protocols (USDC + USDT)
  const rates = await queryAllRates(morphoMarketId);

  console.log('[YieldRouter] Current rates:');
  for (const r of rates) {
    console.log(`  ${r.protocol} (${r.token}) on ${r.chain}: APY=${(r.apy * 100).toFixed(2)}% (risk-adj: ${(r.riskAdjustedApy * 100).toFixed(2)}%)`);
  }

  if (!stateConfig.shouldSupplyAave) {
    return { action: 'HOLD', reasoning: `State is ${state}. Not supplying.`, rates };
  }

  const positions = await getAllPositions(morphoMarketId);

  // Route USDC and USDT independently
  const usdcResult = await routeYieldForToken('USDC', state, liquidBalance, monthlyBurn, rates, positions);
  // For USDT: use actual USDT earnings (passed via caller or query)
  // The agent earns USDT via t402 exact-legacy payments. Supply only what was earned.
  const { getUsdtBalance } = await import('../wdk/index.ts');
  const usdtEarned = await getUsdtBalance();
  const usdtResult = await routeYieldForToken('USDT', state, usdtEarned, monthlyBurn, rates, positions);

  console.log(`[YieldRouter] USDC: ${usdcResult.action} | USDT: ${usdtResult.action}`);

  // Return the more interesting result (SUPPLY > REBALANCE > HOLD)
  const priority: Record<string, number> = { SUPPLY: 3, REBALANCE: 2, HOLD: 0 };
  if ((priority[usdtResult.action] || 0) > (priority[usdcResult.action] || 0)) {
    return { ...usdtResult, rates };
  }
  return { ...usdcResult, rates };
}
