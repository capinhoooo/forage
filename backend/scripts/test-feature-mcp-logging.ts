/**
 * Test: Feature 12 - MCP Logging + Resource Subscriptions
 *
 * Tests:
 * 1. MCP logging functions exist and are callable
 * 2. Resource subscription notification functions exist
 * 3. Logging falls back to console when server not connected
 */
// Logging module doesn't need DB, but resources imports prisma which triggers config validation
// We only test logging standalone + resource notification functions
import { mcpLog, mcpLogInfo, mcpLogWarn, mcpLogError, mcpLogDebug, setMcpLogServer } from '../src/lib/mcp/logging.ts';

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ${PASS} ${name}${detail ? ` (${detail})` : ''}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${name}${detail ? ` (${detail})` : ''}`);
    failed++;
  }
}

async function main() {
  console.log('=== Feature 12: MCP Logging + Resource Subscriptions ===\n');

  // --- Test 1: Logging Functions ---
  console.log('[1] Logging Functions');
  check('mcpLog is function', typeof mcpLog === 'function');
  check('mcpLogInfo is function', typeof mcpLogInfo === 'function');
  check('mcpLogWarn is function', typeof mcpLogWarn === 'function');
  check('mcpLogError is function', typeof mcpLogError === 'function');
  check('mcpLogDebug is function', typeof mcpLogDebug === 'function');
  check('setMcpLogServer is function', typeof setMcpLogServer === 'function');

  // --- Test 2: Logging without server (console fallback) ---
  console.log('\n[2] Console Fallback');
  let consoleOutput = '';
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  const origDebug = console.debug;

  console.log = (...args: any[]) => { consoleOutput += args.join(' ') + '\n'; };
  console.warn = (...args: any[]) => { consoleOutput += args.join(' ') + '\n'; };
  console.error = (...args: any[]) => { consoleOutput += args.join(' ') + '\n'; };
  console.debug = (...args: any[]) => { consoleOutput += args.join(' ') + '\n'; };

  await mcpLogInfo('test-logger', 'info message');
  await mcpLogWarn('test-logger', 'warn message');
  await mcpLogError('test-logger', 'error message');
  await mcpLogDebug('test-logger', 'debug message');

  console.log = origLog;
  console.warn = origWarn;
  console.error = origError;
  console.debug = origDebug;

  check('info logged to console', consoleOutput.includes('[MCP:test-logger]') && consoleOutput.includes('info message'));
  check('warn logged to console', consoleOutput.includes('warn message'));
  check('error logged to console', consoleOutput.includes('error message'));
  check('debug logged to console', consoleOutput.includes('debug message'));

  // --- Test 3: Logging with mock server ---
  console.log('\n[3] MCP Server Integration');
  let serverLogCalled = false;
  let lastLogParams: any = null;
  const mockServer = {
    sendLoggingMessage: async (params: any) => {
      serverLogCalled = true;
      lastLogParams = params;
    },
  };

  setMcpLogServer(mockServer);
  await mcpLogInfo('yield-router', { action: 'rebalance', amount: '5.00 USDC' });

  check('server sendLoggingMessage called', serverLogCalled);
  check('log level is info', lastLogParams?.level === 'info');
  check('logger name is yield-router', lastLogParams?.logger === 'yield-router');
  check('data is structured object', typeof lastLogParams?.data === 'object');

  // Reset
  setMcpLogServer(null as any);

  // --- Test 4: Resource Subscription Functions ---
  // resources.ts imports prisma which triggers config validation, so verify source directly
  console.log('\n[4] Resource Subscriptions');
  const fs = await import('fs');
  const src = fs.readFileSync('src/lib/mcp/resources.ts', 'utf-8');
  check('notifyResourceUpdate exported in source', src.includes('export async function notifyResourceUpdate'));
  check('notifyAllResourcesUpdated exported in source', src.includes('export async function notifyAllResourcesUpdated'));
  check('sendResourceUpdated called in notifyResourceUpdate', src.includes('sendResourceUpdated'));
  check('notifyAllResourcesUpdated calls status/positions/identity',
    src.includes("agent://status") && src.includes("agent://positions") && src.includes("agent://identity"));

  console.log('\n=============================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('=============================\n');

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
