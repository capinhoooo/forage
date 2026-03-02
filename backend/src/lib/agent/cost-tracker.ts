import { prismaQuery } from '../prisma.ts';

export type CostCategory = 'LLM' | 'GAS' | 'STORAGE' | 'INFRASTRUCTURE';

export async function logCost(
  category: CostCategory,
  amountUsdc: bigint,
  detail: string,
): Promise<void> {
  await prismaQuery.costLog.create({
    data: {
      category,
      amount: amountUsdc,
      detail,
    },
  });
}

export async function logLlmCost(
  inputTokens: number,
  outputTokens: number,
  model: string,
): Promise<bigint> {
  // Pricing per million tokens in USDC base units (1 USDC = 1,000,000 base units)
  // $0.80/MTok = 800_000 base units/MTok, $4.00/MTok = 4_000_000 base units/MTok
  const pricing: Record<string, { input: number; output: number }> = {
    'claude-haiku-4-5-20251001': { input: 800_000, output: 4_000_000 },
    'claude-sonnet-4-20250514': { input: 3_000_000, output: 15_000_000 },
    // Groq models (per MTok in USDC base units)
    'llama-3.3-70b-versatile': { input: 590_000, output: 790_000 },
    'llama-3.1-8b-instant': { input: 50_000, output: 80_000 },
  };

  const rates = pricing[model] || pricing['claude-haiku-4-5-20251001'];
  const inputCost = Math.ceil((inputTokens / 1_000_000) * rates.input);
  const outputCost = Math.ceil((outputTokens / 1_000_000) * rates.output);
  const totalCost = BigInt(inputCost + outputCost);

  await logCost('LLM', totalCost, `${model}: ${inputTokens} in + ${outputTokens} out`);
  return totalCost;
}

export async function logGasCost(
  gasUsed: bigint,
  gasPrice: bigint,
  ethPriceUsd: number,
): Promise<bigint> {
  const ethCost = gasUsed * gasPrice; // in wei
  const usdCost = (Number(ethCost) / 1e18) * ethPriceUsd;
  const usdcBaseUnits = BigInt(Math.ceil(usdCost * 1e6));

  await logCost('GAS', usdcBaseUnits, `Gas: ${gasUsed} used @ ${gasPrice} wei, ETH=$${ethPriceUsd.toFixed(2)}`);
  return usdcBaseUnits;
}

export async function getTotalCosts(since: Date): Promise<{
  total: bigint;
  byCategory: Record<string, bigint>;
}> {
  const logs = await prismaQuery.costLog.findMany({
    where: { createdAt: { gte: since } },
  });

  const byCategory: Record<string, bigint> = {};
  let total = 0n;

  for (const log of logs) {
    total += log.amount;
    byCategory[log.category] = (byCategory[log.category] || 0n) + log.amount;
  }

  return { total, byCategory };
}

export async function getDailyCosts(): Promise<bigint> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await getTotalCosts(since);
  return result.total;
}

export async function estimateMonthlyBurn(): Promise<bigint> {
  // Use last 7 days of data, extrapolate to 30 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await getTotalCosts(sevenDaysAgo);
  const dailyAvg = Number(result.total) / 7;
  return BigInt(Math.ceil(dailyAvg * 30));
}
