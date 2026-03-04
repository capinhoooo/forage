import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import { ANTHROPIC_API_KEY, GROQ_API_KEY } from '../../config/main-config.ts';
import { logLlmCost } from '../agent/cost-tracker.ts';
import { getAnthropicMcpTools } from '../mcp/index.ts';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

/**
 * Execute a Claude call with MCP tools available.
 * Handles the tool-use loop (up to 3 iterations for services).
 * Falls back to plain call if MCP tools fail to load.
 */
export async function callWithTools(opts: {
  model: string;
  maxTokens: number;
  system: string;
  userMessage: string;
}): Promise<{
  text: string;
  inputTokens: number;
  outputTokens: number;
  llmCost: bigint;
  toolsUsed: string[];
}> {
  const toolsUsed: string[] = [];
  let totalInput = 0;
  let totalOutput = 0;

  // Try to load MCP tools (non-blocking, fall back to plain call)
  let mcpToolDefs: any[] = [];
  try {
    mcpToolDefs = await getAnthropicMcpTools();
  } catch {
    // MCP not available, proceed without tools
  }

  const messages: any[] = [{ role: 'user', content: opts.userMessage }];

  try {
    let response = await anthropic.messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      ...(mcpToolDefs.length > 0 ? { tools: mcpToolDefs as any } : {}),
      messages,
    });

    totalInput += response.usage.input_tokens;
    totalOutput += response.usage.output_tokens;

    // Handle tool-use loop (max 3 iterations for services to control cost)
    for (let i = 0; i < 3 && response.stop_reason === 'tool_use'; i++) {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults: any[] = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          toolsUsed.push(block.name);
          const tool = mcpToolDefs.find((t: any) => t.name === block.name);
          let result: string;
          if (tool && typeof (tool as any).run === 'function') {
            try {
              result = await (tool as any).run(block.input);
              if (typeof result !== 'string') result = JSON.stringify(result);
            } catch (e: any) {
              result = `Error: ${e.message}`;
            }
          } else {
            result = 'Tool not found';
          }
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
      }

      messages.push({ role: 'user', content: toolResults });

      response = await anthropic.messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.system,
        tools: mcpToolDefs as any,
        messages,
      });

      totalInput += response.usage.input_tokens;
      totalOutput += response.usage.output_tokens;
    }

    const text = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');

    const llmCost = await logLlmCost(totalInput, totalOutput, opts.model);

    return { text, inputTokens: totalInput, outputTokens: totalOutput, llmCost, toolsUsed };
  } catch (anthropicError) {
    // Fallback to Groq for paid services (no tools, but customer still gets a response)
    if (groq) {
      console.warn(`[ToolEnhanced] Anthropic failed, Groq fallback: ${String(anthropicError)}`);
      const fallbackModel = 'llama-3.3-70b-versatile';
      const response = await groq.chat.completions.create({
        model: fallbackModel,
        max_tokens: opts.maxTokens,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.userMessage },
        ],
      });

      const text = response.choices[0]?.message?.content || '';
      const inputTok = response.usage?.prompt_tokens || 0;
      const outputTok = response.usage?.completion_tokens || 0;
      const llmCost = await logLlmCost(inputTok, outputTok, fallbackModel);

      return { text, inputTokens: inputTok, outputTokens: outputTok, llmCost, toolsUsed: [] };
    }
    throw anthropicError;
  }
}
