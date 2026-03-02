import { describe, test, expect } from 'bun:test';
import {
  determineState,
  calculateRunway,
  getStateConfig,
  getLifeMeterPercent,
} from '../src/lib/agent/state-machine.ts';

describe('State Machine: State Determination', () => {
  const burn = 1_000_000n; // $1 monthly burn

  test('DEAD when balance is 0', () => {
    expect(determineState(0n, burn)).toBe('DEAD');
  });

  test('DEAD when balance is negative', () => {
    expect(determineState(-1n, burn)).toBe('DEAD');
  });

  test('CRITICAL when balance < 0.25x burn', () => {
    expect(determineState(200_000n, burn)).toBe('CRITICAL'); // $0.20
  });

  test('DESPERATE when balance between 0.25x and 1x burn', () => {
    expect(determineState(500_000n, burn)).toBe('DESPERATE'); // $0.50
  });

  test('CAUTIOUS when balance between 1x and 1.5x burn', () => {
    expect(determineState(1_200_000n, burn)).toBe('CAUTIOUS'); // $1.20
  });

  test('STABLE when balance between 1.5x and 3x burn', () => {
    expect(determineState(2_000_000n, burn)).toBe('STABLE'); // $2.00
  });

  test('THRIVING when balance > 3x burn', () => {
    expect(determineState(5_000_000n, burn)).toBe('THRIVING'); // $5.00
  });

  test('THRIVING when no burn', () => {
    expect(determineState(100n, 0n)).toBe('THRIVING');
  });
});

describe('State Machine: Runway Calculation', () => {
  test('runway is ratio of value to burn', () => {
    expect(calculateRunway(3_000_000n, 1_000_000n)).toBe(3);
  });

  test('runway returns 999 when no burn', () => {
    expect(calculateRunway(1_000_000n, 0n)).toBe(999);
  });

  test('runway is fractional for low balances', () => {
    expect(calculateRunway(500_000n, 1_000_000n)).toBe(0.5);
  });
});

describe('State Machine: State Configs', () => {
  test('THRIVING allows supply, no withdraw', () => {
    const config = getStateConfig('THRIVING');
    expect(config.shouldSupplyAave).toBe(true);
    expect(config.shouldWithdrawAave).toBe(false);
  });

  test('DESPERATE forces withdrawal', () => {
    const config = getStateConfig('DESPERATE');
    expect(config.shouldSupplyAave).toBe(false);
    expect(config.shouldWithdrawAave).toBe(true);
  });

  test('CRITICAL forces withdrawal', () => {
    const config = getStateConfig('CRITICAL');
    expect(config.shouldSupplyAave).toBe(false);
    expect(config.shouldWithdrawAave).toBe(true);
  });

  test('DEAD does nothing', () => {
    const config = getStateConfig('DEAD');
    expect(config.shouldSupplyAave).toBe(false);
    expect(config.shouldWithdrawAave).toBe(false);
    expect(config.priceMultiplier).toBe(0);
  });

  test('price multiplier decreases with urgency', () => {
    const thriving = getStateConfig('THRIVING').priceMultiplier;
    const stable = getStateConfig('STABLE').priceMultiplier;
    const cautious = getStateConfig('CAUTIOUS').priceMultiplier;
    const desperate = getStateConfig('DESPERATE').priceMultiplier;
    const critical = getStateConfig('CRITICAL').priceMultiplier;

    expect(thriving).toBeGreaterThanOrEqual(stable);
    expect(stable).toBeGreaterThan(cautious);
    expect(cautious).toBeGreaterThan(desperate);
    expect(desperate).toBeGreaterThan(critical);
  });
});

describe('State Machine: Life Meter', () => {
  test('100% when value is 5x burn or more', () => {
    expect(getLifeMeterPercent(5_000_000n, 1_000_000n)).toBe(100);
    expect(getLifeMeterPercent(10_000_000n, 1_000_000n)).toBe(100);
  });

  test('0% when value is 0', () => {
    expect(getLifeMeterPercent(0n, 1_000_000n)).toBe(0);
  });

  test('50% when value is 2.5x burn', () => {
    expect(getLifeMeterPercent(2_500_000n, 1_000_000n)).toBe(50);
  });

  test('100% when no burn', () => {
    expect(getLifeMeterPercent(100n, 0n)).toBe(100);
  });
});
