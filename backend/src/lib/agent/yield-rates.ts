import { Contract, JsonRpcProvider } from 'ethers';
import {
  CHAINS,
  AAVE_CONFIG,
  COMPOUND_CONFIG,
  MORPHO_CONFIG,
  type ChainKey,
  type AaveChainKey,
  type CompoundChainKey,
  type MorphoChainKey,
} from '../wdk/config.ts';
import {
  AAVE_POOL_ABI,
  COMPOUND_COMET_ABI,
  MORPHO_ABI,
  MORPHO_IRM_ABI,
  SECONDS_PER_YEAR,
  PROTOCOL_CONFIGS,
  type RateSnapshot,
  type ProtocolId,
} from './yield-config.ts';

// Cache providers to avoid recreating
const providers: Partial<Record<ChainKey, JsonRpcProvider>> = {};

function getProvider(chain: ChainKey): JsonRpcProvider {
  if (!providers[chain]) {
    providers[chain] = new JsonRpcProvider(CHAINS[chain].provider);
  }
  return providers[chain]!;
}

/**
 * Query Aave V3 supply APY on-chain.
 * getReserveData returns currentLiquidityRate in RAY (1e27), already annualized.
 */
export async function queryAaveApy(chain: ChainKey): Promise<number> {
  if (!(chain in AAVE_CONFIG)) return 0;

  try {
    const config = AAVE_CONFIG[chain as AaveChainKey];
    const provider = getProvider(chain);
    const pool = new Contract(config.pool, AAVE_POOL_ABI, provider);

    const reserveData = await pool.getReserveData(config.usdc);
    const liquidityRate = BigInt(reserveData.currentLiquidityRate.toString());

    // currentLiquidityRate is annualized in RAY (1e27)
    // APR = liquidityRate / 1e27
    const apr = Number(liquidityRate) / 1e27;

    // Convert APR to APY with per-second compounding
    const ratePerSecond = apr / SECONDS_PER_YEAR;
    const apy = Math.pow(1 + ratePerSecond, SECONDS_PER_YEAR) - 1;

    return apy;
  } catch (error) {
    console.error(`[YieldRates] Aave V3 APY query failed on ${chain}:`, error);
    return 0;
  }
}

/**
 * Query Aave V3 USDT supply APY on-chain.
 * Same approach as USDC but using the USDT reserve address.
 */
export async function queryAaveUsdtApy(chain: ChainKey): Promise<number> {
  if (!(chain in AAVE_CONFIG)) return 0;

  try {
    const config = AAVE_CONFIG[chain as AaveChainKey];
    if (!config.usdt) return 0;

    const provider = getProvider(chain);
    const pool = new Contract(config.pool, AAVE_POOL_ABI, provider);

    const reserveData = await pool.getReserveData(config.usdt);
    const liquidityRate = BigInt(reserveData.currentLiquidityRate.toString());

    const apr = Number(liquidityRate) / 1e27;
    const ratePerSecond = apr / SECONDS_PER_YEAR;
    const apy = Math.pow(1 + ratePerSecond, SECONDS_PER_YEAR) - 1;

    return apy;
  } catch (error) {
    console.error(`[YieldRates] Aave V3 USDT APY query failed on ${chain}:`, error);
    return 0;
  }
}

/**
 * Query Compound V3 (Comet) supply APY on-chain.
 * getSupplyRate returns per-second rate scaled by 1e18.
 */
export async function queryCompoundApy(chain: ChainKey): Promise<number> {
  if (!(chain in COMPOUND_CONFIG)) return 0;

  try {
    const config = COMPOUND_CONFIG[chain as CompoundChainKey];
    const provider = getProvider(chain);
    const comet = new Contract(config.comet, COMPOUND_COMET_ABI, provider);

    const utilization = await comet.getUtilization();
    const supplyRate = await comet.getSupplyRate(utilization);

    // supplyRate is per-second, scaled 1e18
    const ratePerSecond = Number(BigInt(supplyRate.toString())) / 1e18;

    // APY with per-second compounding
    const apy = Math.pow(1 + ratePerSecond, SECONDS_PER_YEAR) - 1;

    return apy;
  } catch (error) {
    console.error(`[YieldRates] Compound V3 APY query failed on ${chain}:`, error);
    return 0;
  }
}

/**
 * Query Morpho Blue supply APY on-chain.
 * Requires a valid market ID. Returns 0 if no market found.
 *
 * Supply APY = borrowRate * utilization * (1 - fee)
 */
export async function queryMorphoApy(chain: ChainKey, marketId: string): Promise<number> {
  if (!(chain in MORPHO_CONFIG) || !marketId) return 0;

  try {
    const config = MORPHO_CONFIG[chain as MorphoChainKey];
    const provider = getProvider(chain);
    const morpho = new Contract(config.morpho, MORPHO_ABI, provider);
    const irm = new Contract(config.irm, MORPHO_IRM_ABI, provider);

    // Get market data
    const marketData = await morpho.market(marketId);
    const totalSupplyAssets = BigInt(marketData.totalSupplyAssets.toString());
    const totalBorrowAssets = BigInt(marketData.totalBorrowAssets.toString());
    const fee = BigInt(marketData.fee.toString());

    if (totalSupplyAssets === 0n) return 0;

    // Get market params for IRM query
    const params = await morpho.idToMarketParams(marketId);
    const marketParams = {
      loanToken: params.loanToken,
      collateralToken: params.collateralToken,
      oracle: params.oracle,
      irm: params.irm,
      lltv: params.lltv,
    };

    const marketStruct = {
      totalSupplyAssets: marketData.totalSupplyAssets,
      totalSupplyShares: marketData.totalSupplyShares,
      totalBorrowAssets: marketData.totalBorrowAssets,
      totalBorrowShares: marketData.totalBorrowShares,
      lastUpdate: marketData.lastUpdate,
      fee: marketData.fee,
    };

    // Get borrow rate (per-second, WAD-scaled)
    const borrowRate = await irm.borrowRateView(
      [marketParams.loanToken, marketParams.collateralToken, marketParams.oracle, marketParams.irm, marketParams.lltv],
      [marketStruct.totalSupplyAssets, marketStruct.totalSupplyShares, marketStruct.totalBorrowAssets, marketStruct.totalBorrowShares, marketStruct.lastUpdate, marketStruct.fee],
    );

    const borrowRateNum = Number(BigInt(borrowRate.toString())) / 1e18;
    const utilization = Number(totalBorrowAssets) / Number(totalSupplyAssets);
    const feeRate = Number(fee) / 1e18;

    // Supply APR = borrowRate * utilization * (1 - fee)
    const supplyRatePerSecond = borrowRateNum * utilization * (1 - feeRate);

    // APY with per-second compounding
    const apy = Math.pow(1 + supplyRatePerSecond, SECONDS_PER_YEAR) - 1;

    return apy;
  } catch (error) {
    console.error(`[YieldRates] Morpho Blue APY query failed on ${chain}:`, error);
    return 0;
  }
}

/**
 * Query all protocol APYs and return sorted rate snapshots.
 * Morpho marketId is optional (skip if not set).
 */
export async function queryAllRates(morphoMarketId?: string): Promise<RateSnapshot[]> {
  const snapshots: RateSnapshot[] = [];
  const now = Date.now();

  // Query all protocols in parallel (USDC + USDT)
  const [
    aaveEthSepolia,
    aaveBaseSepolia,
    aaveUsdtEthSepolia,
    aaveUsdtBaseSepolia,
    compoundEthSepolia,
    morphoEthSepolia,
  ] = await Promise.allSettled([
    queryAaveApy('ethereum-sepolia'),
    queryAaveApy('base-sepolia'),
    queryAaveUsdtApy('ethereum-sepolia'),
    queryAaveUsdtApy('base-sepolia'),
    queryCompoundApy('ethereum-sepolia'),
    morphoMarketId ? queryMorphoApy('ethereum-sepolia', morphoMarketId) : Promise.resolve(0),
  ]);

  const addSnapshot = (
    protocol: ProtocolId,
    chain: ChainKey,
    result: PromiseSettledResult<number>,
  ) => {
    const apy = result.status === 'fulfilled' ? result.value : 0;
    const config = PROTOCOL_CONFIGS[protocol];
    snapshots.push({
      protocol,
      chain,
      apy,
      riskScore: config.riskScore,
      riskAdjustedApy: apy * (config.riskScore / 10),
      timestamp: now,
      token: config.token,
    });
  };

  addSnapshot('aave-v3', 'ethereum-sepolia', aaveEthSepolia);
  addSnapshot('aave-v3', 'base-sepolia', aaveBaseSepolia);
  addSnapshot('aave-v3-usdt', 'ethereum-sepolia', aaveUsdtEthSepolia);
  addSnapshot('aave-v3-usdt', 'base-sepolia', aaveUsdtBaseSepolia);
  addSnapshot('compound-v3', 'ethereum-sepolia', compoundEthSepolia);

  if (morphoMarketId) {
    addSnapshot('morpho-blue', 'ethereum-sepolia', morphoEthSepolia);
  }

  // Sort by risk-adjusted APY (highest first)
  snapshots.sort((a, b) => b.riskAdjustedApy - a.riskAdjustedApy);

  return snapshots;
}
