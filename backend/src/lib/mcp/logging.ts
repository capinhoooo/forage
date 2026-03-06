/**
 * MCP Structured Logging
 *
 * Sends typed log messages through the MCP protocol.
 * Clients can filter by level and logger name.
 */

let serverRef: any = null;

type LogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';

/**
 * Set the WdkMcpServer reference for logging.
 * Must be called after server creation but before logging.
 */
export function setMcpLogServer(server: any): void {
  serverRef = server;
}

/**
 * Send a structured log message through MCP.
 * Falls back to console if MCP server not available.
 */
export async function mcpLog(level: LogLevel, logger: string, data: unknown): Promise<void> {
  if (serverRef) {
    try {
      await serverRef.sendLoggingMessage({ level, logger, data });
      return;
    } catch {
      // Fall through to console
    }
  }

  // Fallback to console
  const prefix = `[MCP:${logger}]`;
  switch (level) {
    case 'error':
    case 'critical':
    case 'alert':
    case 'emergency':
      console.error(prefix, data);
      break;
    case 'warning':
      console.warn(prefix, data);
      break;
    case 'debug':
      console.debug(prefix, data);
      break;
    default:
      console.log(prefix, data);
  }
}

// Convenience helpers
export const mcpLogDebug = (logger: string, data: unknown) => mcpLog('debug', logger, data);
export const mcpLogInfo = (logger: string, data: unknown) => mcpLog('info', logger, data);
export const mcpLogWarn = (logger: string, data: unknown) => mcpLog('warning', logger, data);
export const mcpLogError = (logger: string, data: unknown) => mcpLog('error', logger, data);
