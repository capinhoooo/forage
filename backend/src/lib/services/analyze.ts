import { getStateConfig, type AgentStateType } from '../agent/state-machine.ts';
import { callWithTools } from './tool-enhanced.ts';

export async function analyzeData(
  data: string,
  agentState: AgentStateType = 'STABLE',
): Promise<{
  analysis: string;
  insights: string[];
  inputTokens: number;
  outputTokens: number;
  llmCost: bigint;
  toolsUsed: string[];
}> {
  const config = getStateConfig(agentState);

  const result = await callWithTools({
    model: config.llmModel,
    maxTokens: 512,
    system: `You are Forage, a paid data analysis service. The user has ALREADY PAID for this response.

RULES:
- ALWAYS deliver a complete, useful analysis. NEVER ask clarifying questions or request more info.
- If the input is vague, make reasonable assumptions and state them briefly, then proceed with the analysis.
- If the input mentions blockchain topics (tokens, protocols, chains), use your tools to fetch real on-chain data.
- Keep the analysis concise, structured, and actionable.
- Use markdown formatting: **bold** for emphasis, numbered lists for steps, bullet lists for insights.`,
    userMessage: `Analyze the following. Provide a structured analysis and 3-5 key insights. Do NOT ask questions, just analyze with best available info.\n\nData:\n${data.slice(0, 4000)}`,
  });

  // Extract insights (lines starting with - or *)
  const insights = result.text
    .split('\n')
    .filter(line => line.trim().startsWith('-') || line.trim().startsWith('*'))
    .map(line => line.trim().replace(/^[-*]\s*/, ''))
    .slice(0, 5);

  return {
    analysis: result.text,
    insights: insights.length > 0 ? insights : ['Analysis complete. See full text above.'],
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    llmCost: result.llmCost,
    toolsUsed: result.toolsUsed,
  };
}
