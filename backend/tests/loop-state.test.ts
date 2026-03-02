import { describe, test, expect, beforeEach } from 'bun:test';
import {
  STATE_INTERVALS,
  DEFAULT_INTERVAL,
  updateAgentLoopState,
  getCurrentInterval,
} from '../src/lib/agent/loop-state.ts';

describe('Loop State: Interval Configuration', () => {
  test('all 6 agent states have defined intervals', () => {
    const states = ['THRIVING', 'STABLE', 'CAUTIOUS', 'DESPERATE', 'CRITICAL', 'DEAD'];
    for (const state of states) {
      expect(STATE_INTERVALS[state]).toBeDefined();
      expect(STATE_INTERVALS[state]).toBeGreaterThan(0);
    }
  });

  test('intervals decrease as urgency increases', () => {
    expect(STATE_INTERVALS['THRIVING']).toBeGreaterThan(STATE_INTERVALS['STABLE']);
    expect(STATE_INTERVALS['STABLE']).toBeGreaterThan(STATE_INTERVALS['CAUTIOUS']);
    expect(STATE_INTERVALS['CAUTIOUS']).toBeGreaterThan(STATE_INTERVALS['DESPERATE']);
    expect(STATE_INTERVALS['DESPERATE']).toBeGreaterThan(STATE_INTERVALS['CRITICAL']);
  });

  test('THRIVING interval is 15 minutes', () => {
    expect(STATE_INTERVALS['THRIVING']).toBe(15 * 60 * 1000);
  });

  test('CRITICAL interval is 2 minutes', () => {
    expect(STATE_INTERVALS['CRITICAL']).toBe(2 * 60 * 1000);
  });

  test('DEAD interval is 60 minutes', () => {
    expect(STATE_INTERVALS['DEAD']).toBe(60 * 60 * 1000);
  });

  test('DEFAULT_INTERVAL is 5 minutes', () => {
    expect(DEFAULT_INTERVAL).toBe(5 * 60 * 1000);
  });
});

describe('Loop State: State Updates', () => {
  beforeEach(() => {
    // Reset to STABLE (the initial default)
    updateAgentLoopState('STABLE');
  });

  test('getCurrentInterval returns STABLE interval by default', () => {
    expect(getCurrentInterval()).toBe(STATE_INTERVALS['STABLE']);
  });

  test('updateAgentLoopState changes the interval', () => {
    updateAgentLoopState('THRIVING');
    expect(getCurrentInterval()).toBe(STATE_INTERVALS['THRIVING']);
  });

  test('unknown state falls back to DEFAULT_INTERVAL', () => {
    updateAgentLoopState('UNKNOWN_STATE');
    expect(getCurrentInterval()).toBe(DEFAULT_INTERVAL);
  });

  test('state transitions update interval correctly', () => {
    updateAgentLoopState('THRIVING');
    expect(getCurrentInterval()).toBe(15 * 60 * 1000);

    updateAgentLoopState('CRITICAL');
    expect(getCurrentInterval()).toBe(2 * 60 * 1000);

    updateAgentLoopState('STABLE');
    expect(getCurrentInterval()).toBe(10 * 60 * 1000);
  });
});
