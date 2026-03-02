import { runAgentLoop } from '../lib/agent/index.ts';
import { getCurrentInterval } from '../lib/agent/loop-state.ts';

let isRunning = false;
let loopTimer: ReturnType<typeof setTimeout> | null = null;

const agentLoopTask = async (): Promise<void> => {
  if (isRunning) {
    console.log('[AgentLoop] Previous run still active, skipping...');
    scheduleNext();
    return;
  }

  isRunning = true;
  try {
    await runAgentLoop();
  } catch (error) {
    console.error('[AgentLoop] Error:', error);
  } finally {
    isRunning = false;
    scheduleNext();
  }
};

function scheduleNext(): void {
  if (loopTimer) clearTimeout(loopTimer);
  const interval = getCurrentInterval();
  loopTimer = setTimeout(agentLoopTask, interval);
}

export const startAgentLoopWorker = (): void => {
  const initialInterval = getCurrentInterval();
  console.log(`[AgentLoop] Scheduled (adaptive, initial: ${initialInterval / 1000}s)`);

  // Run immediately on startup after a short delay (let WDK initialize)
  setTimeout(() => {
    console.log('[AgentLoop] Running initial loop...');
    agentLoopTask();
  }, 5000);
};
