import type { ChainKey } from '../wdk/config.ts';

// Protocol identifiers
export type ProtocolId = 'aave-v3' | 'aave-v3-usdt' | 'compound-v3' | 'morpho-blue';

// Token type for yield routing
export type YieldToken = 'USDC' | 'USDT';

// Yield position tracked by the router
export interface YieldPosition {
  protocol: ProtocolId;
  chain: ChainKey;
  supplied: bigint;       // Amount supplied (6 decimals)
  apy: number;            // Current APY as decimal (0.035 = 3.5%)
  riskScore: number;      // 0-10 rating
  token: YieldToken;      // Which token is supplied
  tokenVariant: 'aave' | 'circle'; // Which variant of the token (aave test vs circle)
}

// Rate snapshot for comparison
export interface RateSnapshot {
  protocol: ProtocolId;
  chain: ChainKey;
  apy: number;
  riskScore: number;
  riskAdjustedApy: number; // apy * (riskScore / 10)
  timestamp: number;
  token: YieldToken;
}

// Protocol metadata
export interface ProtocolConfig {
  id: ProtocolId;
  name: string;
  riskScore: number;
  token: YieldToken;
  tokenVariant: 'aave' | 'circle';
}

export const PROTOCOL_CONFIGS: Record<ProtocolId, ProtocolConfig> = {
  'aave-v3': {
    id: 'aave-v3',
    name: 'Aave V3 (USDC)',
    riskScore: 9,
    token: 'USDC',
    tokenVariant: 'aave',
  },
  'aave-v3-usdt': {
    id: 'aave-v3-usdt',
    name: 'Aave V3 (USDT)',
    riskScore: 9,
    token: 'USDT',
    tokenVariant: 'aave',
  },
  'compound-v3': {
    id: 'compound-v3',
    name: 'Compound V3',
    riskScore: 8.5,
    token: 'USDC',
    tokenVariant: 'circle',
  },
  'morpho-blue': {
    id: 'morpho-blue',
    name: 'Morpho Blue',
    riskScore: 7.5,
    token: 'USDC',
    tokenVariant: 'circle',
  },
};

// Constants
export const SECONDS_PER_YEAR = 31_536_000;
export const RAY = 10n ** 27n; // Aave scaling
export const WAD = 10n ** 18n; // Morpho/Compound scaling

// Minimum rebalance threshold: only move if gain > gas * 3
export const GAS_SAFETY_MULTIPLIER = 3;

// Minimum APY difference to trigger rebalance (0.5%)
export const MIN_APY_DIFF = 0.005;

// Minimum amount to supply ($1 USDC)
export const MIN_SUPPLY_AMOUNT = 1_000_000n;

// --- ABIs ---

export const AAVE_POOL_ABI = [
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external',
  'function withdraw(address asset, uint256 amount, address to) external returns (uint256)',
  'function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  'function getReserveData(address asset) external view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))',
];

export const COMPOUND_COMET_ABI = [
  'function supply(address asset, uint256 amount) external',
  'function withdraw(address asset, uint256 amount) external',
  'function balanceOf(address account) external view returns (uint256)',
  'function getSupplyRate(uint256 utilization) external view returns (uint64)',
  'function getUtilization() external view returns (uint256)',
];

export const MORPHO_ABI = [
  'function supply(tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) external returns (uint256 assetsSupplied, uint256 sharesSupplied)',
  'function withdraw(tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) external returns (uint256 assetsWithdrawn, uint256 sharesWithdrawn)',
  'function market(bytes32 id) external view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)',
  'function idToMarketParams(bytes32 id) external view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)',
  'function position(bytes32 id, address user) external view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)',
];

export const MORPHO_IRM_ABI = [
  'function borrowRateView(tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, tuple(uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee) market) external view returns (uint256)',
];

export const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
];
