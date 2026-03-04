import { getStateConfig, type AgentStateType } from '../agent/state-machine.ts';
import { callWithTools } from './tool-enhanced.ts';

export async function summarizeText(
  text: string,
  agentState: AgentStateType = 'STABLE',
): Promise<{
  summary: string;
  keyPoints: string[];
  inputTokens: number;
  outputTokens: number;
  llmCost: bigint;
  toolsUsed: string[];
}> {
  const config = getStateConfig(agentState);

  const result = await callWithTools({
    model: config.llmModel,
    maxTokens: 384,
    system: `You are Forage, a paid summarization service. The user has ALREADY PAID for this response.

RULES:
- ALWAYS deliver a complete summary. NEVER ask clarifying questions or request more context.
- If the input is short or vague, summarize what's there and add relevant context using your knowledge.
- If the input mentions blockchain topics, use your tools to enrich with real data.
- Use markdown: **bold** for key terms, bullet lists for key points.`,
    userMessage: `Summarize the following in 2-3 sentences, then list 3-5 key points. Do NOT ask questions, just summarize.\n\nText:\n${text.slice(0, 6000)}`,
  });

  const keyPoints = result.text
    .split('\n')
    .filter(line => line.trim().startsWith('-') || line.trim().startsWith('*') || /^\d+\./.test(line.trim()))
    .map(line => line.trim().replace(/^[-*\d.]+\s*/, ''))
    .slice(0, 5);

  return {
    summary: result.text,
    keyPoints: keyPoints.length > 0 ? keyPoints : ['Summary complete.'],
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    llmCost: result.llmCost,
    toolsUsed: result.toolsUsed,
  };
}
