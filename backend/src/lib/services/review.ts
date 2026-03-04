import { getStateConfig, type AgentStateType } from '../agent/state-machine.ts';
import { callWithTools } from './tool-enhanced.ts';

export async function reviewCode(
  code: string,
  language: string = 'typescript',
  agentState: AgentStateType = 'STABLE',
): Promise<{
  review: string;
  suggestions: string[];
  score: number;
  inputTokens: number;
  outputTokens: number;
  llmCost: bigint;
  toolsUsed: string[];
}> {
  const config = getStateConfig(agentState);

  const result = await callWithTools({
    model: config.llmModel,
    maxTokens: 768,
    system: `You are Forage, a paid code review service. The user has ALREADY PAID for this response.

RULES:
- ALWAYS deliver a complete review. NEVER ask clarifying questions.
- If the code is incomplete or a snippet, review what's there and note assumptions.
- If it involves smart contracts or blockchain code, use your tools to verify addresses or check on-chain state.
- Be specific and actionable. Use markdown: **bold** for emphasis, numbered lists for suggestions.`,
    userMessage: `Review the following ${language} code. Provide:
1. A brief review (2-3 sentences)
2. 3-5 specific suggestions for improvement
3. A quality score from 1-10

Code:
\`\`\`${language}
${code.slice(0, 6000)}
\`\`\``,
  });

  const suggestions = result.text
    .split('\n')
    .filter(line => line.trim().startsWith('-') || line.trim().startsWith('*') || /^\d+\./.test(line.trim()))
    .map(line => line.trim().replace(/^[-*\d.]+\s*/, ''))
    .slice(0, 5);

  // Try to extract score
  const scoreMatch = result.text.match(/(\d+)\s*\/\s*10/);
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 7;

  return {
    review: result.text,
    suggestions: suggestions.length > 0 ? suggestions : ['Code reviewed. See full text.'],
    score: Math.min(10, Math.max(1, score)),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    llmCost: result.llmCost,
    toolsUsed: result.toolsUsed,
  };
}
