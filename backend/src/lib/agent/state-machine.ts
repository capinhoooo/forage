import { AGENT_MONTHLY_BURN_ESTIMATE } from '../../config/main-config.ts';

export type AgentStateType = 'THRIVING' | 'STABLE' | 'CAUTIOUS' | 'DESPERATE' | 'CRITICAL' | 'DEAD';

export interface AgentStateInfo {
  state: AgentStateType;
  balanceUsdc: bigint;
  balanceEth: bigint;
  monthlyBurn: bigint;
  runway: number; // months
  aaveSupplied: bigint;
  totalValue: bigint; // liquid + aave
}

// State thresholds as multipliers of monthly burn
const THRESHOLDS = {
  THRIVING: 3.0,
  STABLE: 1.5,
  CAUTIOUS: 1.0,
  DESPERATE: 0.25,
} as const;

export function determineState(totalValueUsdc: bigint, monthlyBurn: bigint): AgentStateType {
  if (totalValueUsdc <= 0n) return 'DEAD';

  const burnNum = Number(monthlyBurn);
  if (burnNum === 0) return 'THRIVING';

  const ratio = Number(totalValueUsdc) / burnNum;

  if (ratio > THRESHOLDS.THRIVING) return 'THRIVING';
  if (ratio > THRESHOLDS.STABLE) return 'STABLE';
  if (ratio > THRESHOLDS.CAUTIOUS) return 'CAUTIOUS';
  if (ratio > THRESHOLDS.DESPERATE) return 'DESPERATE';
  return 'CRITICAL';
}

export function calculateRunway(totalValueUsdc: bigint, monthlyBurn: bigint): number {
  if (monthlyBurn <= 0n) return 999;
  return Number(totalValueUsdc) / Number(monthlyBurn);
}

export function getStateConfig(state: AgentStateType) {
  const configs: Record<AgentStateType, {
    llmModel: string;
    priceMultiplier: number;
    shouldSupplyAave: boolean;
    shouldWithdrawAave: boolean;
    color: string;
    description: string;
  }> = {
    THRIVING: {
      llmModel: 'claude-sonnet-4-20250514',
      priceMultiplier: 1.0,
      shouldSupplyAave: true,
      shouldWithdrawAave: false,
      color: '#22c55e',
      description: 'Balance exceeds 3x monthly cost. Investing surplus.',
    },
    STABLE: {
      llmModel: 'claude-haiku-4-5-20251001',
      priceMultiplier: 1.0,
      shouldSupplyAave: true,
      shouldWithdrawAave: false,
      color: '#84cc16',
      description: 'Healthy balance. Normal operations.',
    },
    CAUTIOUS: {
      llmModel: 'claude-haiku-4-5-20251001',
      priceMultiplier: 0.8,
      shouldSupplyAave: false,
      shouldWithdrawAave: false,
      color: '#eab308',
      description: 'Balance at 1x monthly cost. Reducing expenses.',
    },
    DESPERATE: {
      llmModel: 'llama-3.3-70b-versatile',
      priceMultiplier: 0.5,
      shouldSupplyAave: false,
      shouldWithdrawAave: true,
      color: '#f97316',
      description: 'Low balance. Aggressive cost cutting. Withdrawing Aave. Using free LLM.',
    },
    CRITICAL: {
      llmModel: 'llama-3.1-8b-instant',
      priceMultiplier: 0.3,
      shouldSupplyAave: false,
      shouldWithdrawAave: true,
      color: '#ef4444',
      description: 'Near death. Conservation mode. Free LLM only.',
    },
    DEAD: {
      llmModel: 'llama-3.1-8b-instant',
      priceMultiplier: 0,
      shouldSupplyAave: false,
      shouldWithdrawAave: false,
      color: '#1f2937',
      description: 'Balance depleted. Agent shutdown.',
    },
  };

  return configs[state];
}

export function getLifeMeterPercent(totalValueUsdc: bigint, monthlyBurn: bigint): number {
  if (monthlyBurn <= 0n) return 100;
  // 100% = 5x monthly burn, 0% = $0
  const maxValue = Number(monthlyBurn) * 5;
  const percent = (Number(totalValueUsdc) / maxValue) * 100;
  return Math.min(100, Math.max(0, percent));
}

export function getMonthlyBurnEstimate(): bigint {
  return BigInt(AGENT_MONTHLY_BURN_ESTIMATE);
}
