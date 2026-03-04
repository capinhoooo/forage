import { queryAllRates, queryAaveApy, queryAaveUsdtApy, queryCompoundApy } from '../agent/yield-rates.ts';
import type { RateSnapshot } from '../agent/yield-config.ts';

export interface YieldOracleResult {
  rates: Array<{
    protocol: string;
    chain: string;
    token: string;
    apy: string;
    riskScore: number;
    riskAdjustedApy: string;
  }>;
  bestOpportunity: {
    protocol: string;
    chain: string;
    token: string;
    apy: string;
    riskScore: number;
  } | null;
  queriedAt: string;
  protocolCount: number;
}

/**
 * Query live on-chain yield rates from Aave V3, Compound V3, and Morpho Blue.
 * Returns APYs sorted by risk-adjusted return. This is the exact same data
 * the agent uses internally for its own yield optimization decisions.
 */
export async function getYieldOracleData(): Promise<YieldOracleResult> {
  const snapshots = await queryAllRates();

  const rates = snapshots.map((s: RateSnapshot) => ({
    protocol: s.protocol,
    chain: s.chain,
    token: s.token,
    apy: `${(s.apy * 100).toFixed(4)}%`,
    riskScore: s.riskScore,
    riskAdjustedApy: `${(s.riskAdjustedApy * 100).toFixed(4)}%`,
  }));

  const best = snapshots.length > 0 ? snapshots[0] : null;

  return {
    rates,
    bestOpportunity: best ? {
      protocol: best.protocol,
      chain: best.chain,
      token: best.token,
      apy: `${(best.apy * 100).toFixed(4)}%`,
      riskScore: best.riskScore,
    } : null,
    queriedAt: new Date().toISOString(),
    protocolCount: snapshots.length,
  };
}
