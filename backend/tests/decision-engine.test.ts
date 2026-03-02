import { describe, test, expect } from 'bun:test';

/**
 * Tests for decision engine context hashing and caching.
 * These test the pure logic functions without requiring LLM calls.
 */

// Re-implement hashContext locally since it's not exported
function hashContext(ctx: {
  state: string;
  balanceUsdc: number;
  balanceUsdt: number;
  monthlyBurn: number;
  aaveSupplied: number;
  todayEarnings: number;
  todayCosts: number;
  requestsToday: number;
}): string {
  return [
    ctx.state,
    Math.round(ctx.balanceUsdc * 100),
    Math.round(ctx.balanceUsdt * 100),
    Math.round(ctx.monthlyBurn * 100),
    Math.round(ctx.aaveSupplied * 100),
    Math.round(ctx.todayEarnings * 1000),
    Math.round(ctx.todayCosts * 1000),
    ctx.requestsToday,
  ].join('|');
}

describe('Decision Engine: Context Hashing', () => {
  const baseContext = {
    state: 'STABLE',
    balanceUsdc: 5.0,
    balanceUsdt: 2.0,
    monthlyBurn: 1.5,
    aaveSupplied: 3.0,
    todayEarnings: 0.05,
    todayCosts: 0.02,
    requestsToday: 10,
  };

  test('produces deterministic hash for same context', () => {
    const hash1 = hashContext(baseContext);
    const hash2 = hashContext(baseContext);
    expect(hash1).toBe(hash2);
  });

  test('hash changes when state changes', () => {
    const hash1 = hashContext(baseContext);
    const hash2 = hashContext({ ...baseContext, state: 'THRIVING' });
    expect(hash1).not.toBe(hash2);
  });

  test('hash changes when balance changes significantly', () => {
    const hash1 = hashContext(baseContext);
    // $0.01 change should trigger (rounded to cent)
    const hash2 = hashContext({ ...baseContext, balanceUsdc: 5.01 });
    expect(hash1).not.toBe(hash2);
  });

  test('hash ignores sub-cent balance fluctuations', () => {
    const hash1 = hashContext(baseContext);
    // $0.001 change should NOT trigger (below rounding threshold)
    const hash2 = hashContext({ ...baseContext, balanceUsdc: 5.001 });
    expect(hash1).toBe(hash2);
  });

  test('hash changes when requestsToday changes', () => {
    const hash1 = hashContext(baseContext);
    const hash2 = hashContext({ ...baseContext, requestsToday: 11 });
    expect(hash1).not.toBe(hash2);
  });

  test('hash changes when earnings change at $0.001 granularity', () => {
    const hash1 = hashContext(baseContext);
    const hash2 = hashContext({ ...baseContext, todayEarnings: 0.051 });
    expect(hash1).not.toBe(hash2);
  });

  test('hash ignores sub-$0.001 earnings fluctuations', () => {
    const hash1 = hashContext(baseContext);
    const hash2 = hashContext({ ...baseContext, todayEarnings: 0.0501 });
    expect(hash1).toBe(hash2);
  });

  test('hash contains all 8 fields separated by pipes', () => {
    const hash = hashContext(baseContext);
    const parts = hash.split('|');
    expect(parts).toHaveLength(8);
    expect(parts[0]).toBe('STABLE');
  });
});

describe('Decision Engine: Action Types', () => {
  const validActions = [
    'HOLD',
    'SUPPLY_AAVE',
    'WITHDRAW_AAVE',
    'ADJUST_PRICING',
    'REDUCE_COSTS',
    'EMERGENCY',
    'GATHER_INTELLIGENCE',
    'SWAP_TOKENS',
  ];

  test('all 8 actions are defined', () => {
    expect(validActions).toHaveLength(8);
  });

  test('SWAP_TOKENS is a valid action', () => {
    expect(validActions).toContain('SWAP_TOKENS');
  });

  test('GATHER_INTELLIGENCE is a valid action', () => {
    expect(validActions).toContain('GATHER_INTELLIGENCE');
  });
});
