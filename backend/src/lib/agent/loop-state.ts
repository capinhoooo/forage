/**
 * Shared adaptive loop state.
 * Separated from agentLoop.ts to avoid circular dependency
 * (agent/index.ts needs to update state, agentLoop.ts needs to read it).
 */

// Adaptive intervals based on agent state (milliseconds)
export const STATE_INTERVALS: Record<string, number> = {
  THRIVING: 15 * 60 * 1000,   // 15 min (relaxed, nothing urgent)
  STABLE: 10 * 60 * 1000,     // 10 min (healthy, moderate pace)
  CAUTIOUS: 5 * 60 * 1000,    // 5 min (watch closely)
  DESPERATE: 3 * 60 * 1000,   // 3 min (need fast reactions)
  CRITICAL: 2 * 60 * 1000,    // 2 min (emergency pace)
  DEAD: 60 * 60 * 1000,       // 60 min (just check if revived)
};

export const DEFAULT_INTERVAL = 5 * 60 * 1000;

let currentAgentState = 'STABLE';

export function updateAgentLoopState(state: string): void {
  if (state !== currentAgentState) {
    const oldInterval = STATE_INTERVALS[currentAgentState] || DEFAULT_INTERVAL;
    const newInterval = STATE_INTERVALS[state] || DEFAULT_INTERVAL;
    currentAgentState = state;
    if (oldInterval !== newInterval) {
      console.log(`[AgentLoop] Interval changed: ${oldInterval / 1000}s -> ${newInterval / 1000}s (state: ${state})`);
    }
  }
}

export function getCurrentInterval(): number {
  return STATE_INTERVALS[currentAgentState] || DEFAULT_INTERVAL;
}
