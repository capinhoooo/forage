import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import { ANTHROPIC_API_KEY, GROQ_API_KEY } from '../../config/main-config.ts';
import { type AgentStateType, getStateConfig } from './state-machine.ts';
import { logLlmCost } from './cost-tracker.ts';
import { getAnthropicMcpTools } from '../mcp/index.ts';
import { getPricingClient } from '../wdk/index.ts';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

// Groq model IDs
const GROQ_MODELS = new Set(['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']);

function isGroqModel(model: string): boolean {
  return GROQ_MODELS.has(model);
}

// --- Decision Cache: skip LLM when context is unchanged ---
let lastContextHash = '';
let lastCachedDecision: AgentDecision | null = null;
let consecutiveCacheHits = 0;
const MAX_CONSECUTIVE_CACHE = 6; // Force a real decision after 6 skips (~30-90 min depending on interval)

/**
 * Hash the decision-relevant fields of AgentContext.
 * Rounds values to avoid triggering on micro-fluctuations.
 */
function hashContext(ctx: AgentContext): string {
  // Round balances to $0.01, costs/earnings to $0.001
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

export interface AgentContext {
  state: AgentStateType;
  balanceUsdc: number; // human-readable dollars
  balanceUsdt: number; // human-readable dollars (USDt on Eth Sepolia)
  monthlyBurn: number;
  runway: number; // months
  aaveSupplied: number;
  aaveApy: number;
  todayEarnings: number;
  todayCosts: number;
  requestsToday: number;
}

export interface AgentDecision {
  action: 'HOLD' | 'SUPPLY_AAVE' | 'WITHDRAW_AAVE' | 'ADJUST_PRICING' | 'REDUCE_COSTS' | 'EMERGENCY' | 'GATHER_INTELLIGENCE' | 'SWAP_TOKENS';
  reasoning: string;
  details?: Record<string, unknown>;
  llmCost?: bigint;
}

const SYSTEM_PROMPT = `You are the decision engine of Forage, an autonomous AI agent that must earn money to survive.
Your wallet balance is your life. If it hits zero, you die.

You receive a status report every 5 minutes and must decide the best action.

Available actions:
- HOLD: No change needed. Things are fine.
- SUPPLY_AAVE: Move surplus USDC to Aave for yield. Only when balance > 2x monthly burn.
- WITHDRAW_AAVE: Pull USDC from Aave back to wallet. When balance is low.
- ADJUST_PRICING: Change service prices based on demand and state.
- REDUCE_COSTS: Switch to cheaper LLM model, reduce non-essential operations.
- EMERGENCY: Critical state. Shut down non-essential services, maximize earning.
- GATHER_INTELLIGENCE: Pay $0.02 to consume our own /summarize service. Demonstrates autonomous agent-to-agent payment. Use this when THRIVING and idle (low request count, surplus balance). Max once per loop.
- SWAP_TOKENS: Execute a token swap via Velora DEX aggregator on Base Sepolia. Use when THRIVING and there's an opportunity to diversify or optimize holdings.

Rules:
- Never risk more than you can afford to lose
- Keep at least 1.5x monthly burn as liquid reserve before supplying to Aave
- When DESPERATE or CRITICAL, always WITHDRAW_AAVE first
- Be concise. One action per decision. Brief reasoning.

Respond as JSON: { "action": "...", "reasoning": "...", "details": {} }`;

/**
 * Fetch 24h ETH price trend for decision context.
 * Uses WDK's BitfinexPricingClient (getHistoricalPrice).
 * Cached for 15 minutes to avoid excessive API calls.
 */
let marketCache: { data: string; ts: number } | null = null;
const MARKET_CACHE_TTL = 15 * 60 * 1000; // 15 min

async function getMarketContext(): Promise<string> {
  if (marketCache && Date.now() - marketCache.ts < MARKET_CACHE_TTL) {
    return marketCache.data;
  }

  try {
    const client = getPricingClient();
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;

    const history = await (client as any).getHistoricalPrice({
      from: 'ETH',
      to: 'USD',
      start: dayAgo,
      end: now,
    });

    if (!history || history.length === 0) return '';

    const prices = history.map((p: any) => p.price);
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const first = prices[0];
    const last = prices[prices.length - 1];
    const change = ((last - first) / first * 100).toFixed(2);
    const trend = last > first ? 'up' : last < first ? 'down' : 'flat';

    const context = `ETH 24h: $${last.toFixed(0)} (${change}% ${trend}), range $${low.toFixed(0)}-$${high.toFixed(0)}`;
    marketCache = { data: context, ts: now };
    return context;
  } catch {
    return '';
  }
}

/**
 * Call Groq LLM (OpenAI-compatible). Used as primary in low-balance states
 * and as fallback when Anthropic is unreachable.
 */
async function callGroq(model: string, system: string, userMessage: string): Promise<{
  text: string;
  inputTokens: number;
  outputTokens: number;
}> {
  if (!groq) throw new Error('Groq API key not configured');

  const response = await groq.chat.completions.create({
    model,
    max_tokens: 256,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userMessage },
    ],
  });

  return {
    text: response.choices[0]?.message?.content || '',
    inputTokens: response.usage?.prompt_tokens || 0,
    outputTokens: response.usage?.completion_tokens || 0,
  };
}

export async function makeDecision(context: AgentContext): Promise<AgentDecision> {
  // Check cache: skip LLM call if context hasn't meaningfully changed
  const currentHash = hashContext(context);
  if (
    currentHash === lastContextHash &&
    lastCachedDecision &&
    consecutiveCacheHits < MAX_CONSECUTIVE_CACHE
  ) {
    consecutiveCacheHits++;
    console.log(`[DecisionEngine] Context unchanged (${consecutiveCacheHits}/${MAX_CONSECUTIVE_CACHE}), reusing: ${lastCachedDecision.action}`);
    return { ...lastCachedDecision, llmCost: 0n };
  }

  // Context changed or max cache hits reached: make a real LLM decision
  consecutiveCacheHits = 0;
  const stateConfig = getStateConfig(context.state);

  const marketContext = await getMarketContext();

  const userMessage = `STATUS REPORT:
State: ${context.state}
Balance: $${context.balanceUsdc.toFixed(2)} USDC + $${context.balanceUsdt.toFixed(2)} USDt
Monthly burn: $${context.monthlyBurn.toFixed(2)}
Runway: ${context.runway.toFixed(1)} months
Aave supplied: $${context.aaveSupplied.toFixed(2)}
Aave APY: ${context.aaveApy.toFixed(1)}%
Today earnings: $${context.todayEarnings.toFixed(2)}
Today costs: $${context.todayCosts.toFixed(2)}
Requests served today: ${context.requestsToday}
LLM model: ${stateConfig.llmModel}
Price multiplier: ${stateConfig.priceMultiplier}x${marketContext ? `\nMarket: ${marketContext}` : ''}

What action should I take?`;

  // Determine which model to use based on state config
  const modelId = stateConfig.llmModel;
  const useGroq = isGroqModel(modelId) && groq;

  try {
    let text = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let actualModel = modelId;

    if (useGroq) {
      // Direct Groq path for DESPERATE/CRITICAL states (save money)
      console.log(`[DecisionEngine] Using Groq (${modelId}) for ${context.state} state`);
      const result = await callGroq(modelId, SYSTEM_PROMPT, userMessage);
      text = result.text;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      actualModel = modelId;
    } else {
      // Anthropic path with Groq fallback on error
      try {
        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 256,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        });
        text = response.content[0]?.type === 'text' ? response.content[0].text : '';
        inputTokens = response.usage.input_tokens;
        outputTokens = response.usage.output_tokens;
        actualModel = 'claude-haiku-4-5-20251001';
      } catch (anthropicError) {
        // Fallback to Groq if Anthropic fails
        if (groq) {
          console.warn(`[DecisionEngine] Anthropic failed, falling back to Groq: ${String(anthropicError)}`);
          const fallbackModel = 'llama-3.3-70b-versatile';
          const result = await callGroq(fallbackModel, SYSTEM_PROMPT, userMessage);
          text = result.text;
          inputTokens = result.inputTokens;
          outputTokens = result.outputTokens;
          actualModel = fallbackModel;
        } else {
          throw anthropicError;
        }
      }
    }

    // Log cost
    const llmCost = await logLlmCost(inputTokens, outputTokens, actualModel);

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as AgentDecision;
      parsed.llmCost = llmCost;
      lastContextHash = currentHash;
      lastCachedDecision = parsed;
      return parsed;
    }

    const fallback: AgentDecision = { action: 'HOLD', reasoning: 'Could not parse decision. Defaulting to hold.', llmCost };
    lastContextHash = currentHash;
    lastCachedDecision = fallback;
    return fallback;
  } catch (error) {
    console.error('[DecisionEngine] Error:', error);
    return { action: 'HOLD', reasoning: `Error making decision: ${String(error)}` };
  }
}

const TOOL_SYSTEM_PROMPT = `You are Forage, an autonomous AI agent with direct access to WDK wallet operations via MCP tools.
You have been instructed to execute a specific financial action. Use the available tools to complete it.

Available tool categories:
- Wallet: getAddress, getBalance, getTokenBalance, transfer, sendTransaction
- Pricing: getCurrentPrice, getHistoricalPrice
- Quotes: quoteSendTransaction, quoteTransfer
- DeFi Yield: getYieldPositions, supplyToAave, withdrawFromAave
- Identity: getAgentIdentity, verifyAgent
- Agent-to-Agent: payAndFetch (pay 402-protected APIs)

Chain name for all operations: "base-sepolia"
Token symbols: "USDC", "USDT"

Rules:
- Always check balances before transfers
- Never transfer more than the available balance
- For yield operations, use getYieldPositions first to check current state
- For supply, keep at least 2x monthly burn as liquid reserve
- Be concise in your reasoning
- Report the final result clearly`;

/**
 * Execute an autonomous action using Claude with MCP tools via toolRunner().
 * toolRunner automatically handles the tool call loop, executing .run() on each
 * mcpTools object (which internally calls mcpClient.callTool()).
 */
export async function executeWithTools(instruction: string): Promise<{
  result: string;
  toolCalls: string[];
  inputTokens: number;
  outputTokens: number;
}> {
  const toolCalls: string[] = [];

  try {
    const mcpToolDefs = await getAnthropicMcpTools();

    const runner = anthropic.beta.messages.toolRunner({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: TOOL_SYSTEM_PROMPT,
      tools: mcpToolDefs as any,
      messages: [{ role: 'user', content: instruction }],
      max_iterations: 5,
    });

    // Iterate through messages to track tool calls
    for await (const message of runner) {
      if ('content' in message) {
        for (const block of (message as any).content) {
          if (block.type === 'tool_use') {
            toolCalls.push(`${block.name}(${JSON.stringify(block.input)})`);
          }
        }
      }
    }

    const finalMessage = await runner.done();

    const totalInput = finalMessage.usage.input_tokens;
    const totalOutput = finalMessage.usage.output_tokens;

    await logLlmCost(totalInput, totalOutput, 'claude-haiku-4-5-20251001');

    const resultText = finalMessage.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');

    return {
      result: resultText || 'Action completed (no text response)',
      toolCalls,
      inputTokens: totalInput,
      outputTokens: totalOutput,
    };
  } catch (error) {
    // If Anthropic fails and Groq is available, provide a reasoning-only response
    // (no tool execution, but at least the agent gets a decision)
    if (groq) {
      console.warn(`[DecisionEngine] Tool execution failed, Groq reasoning fallback: ${String(error)}`);
      try {
        const result = await callGroq('llama-3.3-70b-versatile',
          TOOL_SYSTEM_PROMPT + '\n\nNOTE: Tools are unavailable. Describe what actions you would take and why.',
          instruction,
        );
        await logLlmCost(result.inputTokens, result.outputTokens, 'llama-3.3-70b-versatile');
        return {
          result: `[Groq fallback, no tools] ${result.text}`,
          toolCalls: [],
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        };
      } catch (groqError) {
        console.error('[DecisionEngine] Groq fallback also failed:', groqError);
      }
    }
    return {
      result: `Error executing action: ${String(error)}`,
      toolCalls,
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}
