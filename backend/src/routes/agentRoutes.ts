import type { FastifyInstance, FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import { prismaQuery } from '../lib/prisma.ts';
import { getAgentStatus, resetAgent } from '../lib/agent/index.ts';
import { executeWithTools } from '../lib/agent/decision-engine.ts';
import { getAavePositions } from '../lib/agent/yield-optimizer.ts';
import { getTotalCosts } from '../lib/agent/cost-tracker.ts';
import { getStateConfig } from '../lib/agent/state-machine.ts';
import { CHAINS, PRIMARY_CHAIN, SERVICE_PRICES } from '../lib/wdk/config.ts';
import { getMcpClient } from '../lib/mcp/index.ts';

export const agentRoutes: FastifyPluginCallback = (app: FastifyInstance, _opts, done) => {
  // GET /agent/status - Current agent state
  app.get('/status', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = await getAgentStatus();
      const stateConfig = getStateConfig(status.state as any);

      return reply.code(200).send({
        success: true,
        error: null,
        data: {
          ...status,
          stateConfig: {
            color: stateConfig.color,
            description: stateConfig.description,
            llmModel: stateConfig.llmModel,
            priceMultiplier: stateConfig.priceMultiplier,
          },
          explorerUrl: CHAINS[PRIMARY_CHAIN].explorerUrl,
        },
      });
    } catch (error) {
      return reply.code(500).send({ success: false, error: { code: 'STATUS_ERROR', message: String(error) }, data: null });
    }
  });

  // GET /agent/history - Recent transactions
  app.get('/history', async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit = '50', offset = '0', type } = request.query as { limit?: string; offset?: string; type?: string };

    const where = type ? { type } : {};
    const transactions = await prismaQuery.agentTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit, 10),
      skip: parseInt(offset, 10),
    });

    // Serialize BigInt to string
    const serialized = transactions.map((tx: any) => ({
      ...tx,
      amount: tx.amount.toString(),
    }));

    return reply.code(200).send({ success: true, error: null, data: serialized });
  });

  // GET /agent/pnl - Profit and loss
  app.get('/pnl', async (request: FastifyRequest, reply: FastifyReply) => {
    const { period = '24h' } = request.query as { period?: string };

    const periodMs: Record<string, number> = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };

    const since = new Date(Date.now() - (periodMs[period] || periodMs['24h']));

    // Revenue
    const revenue = await prismaQuery.agentTransaction.aggregate({
      where: { type: 'EARN', createdAt: { gte: since } },
      _sum: { amount: true },
    });

    // Costs
    const costs = await getTotalCosts(since);

    // Hourly data points for chart
    const transactions = await prismaQuery.agentTransaction.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
    });

    // Group by hour (only count real costs, not DeFi movements)
    const COST_TYPES = new Set(['SPEND_LLM', 'SPEND_GAS', 'SPEND_SERVICE']);
    const hourlyMap = new Map<string, { revenue: bigint; costs: bigint }>();
    for (const tx of transactions) {
      const hour = new Date(tx.createdAt);
      hour.setMinutes(0, 0, 0);
      const key = hour.toISOString();

      const entry = hourlyMap.get(key) || { revenue: 0n, costs: 0n };
      if (tx.type === 'EARN') {
        entry.revenue += tx.amount;
      } else if (COST_TYPES.has(tx.type)) {
        entry.costs += tx.amount;
      }
      // Skip AAVE_SUPPLY, AAVE_WITHDRAW, DEFI_SUPPLY, DEFI_WITHDRAW, SWAP, BRIDGE
      // These are capital movements, not operational costs
      hourlyMap.set(key, entry);
    }

    const dataPoints = Array.from(hourlyMap.entries()).map(([timestamp, data]) => ({
      timestamp,
      revenue: data.revenue.toString(),
      costs: data.costs.toString(),
    }));

    const totalRevenue = revenue._sum.amount || 0n;
    const totalCosts = costs.total;
    const net = totalRevenue - totalCosts;

    return reply.code(200).send({
      success: true,
      error: null,
      data: {
        period,
        revenue: totalRevenue.toString(),
        costs: totalCosts.toString(),
        net: net.toString(),
        costBreakdown: Object.fromEntries(
          Object.entries(costs.byCategory).map(([k, v]) => [k, v.toString()])
        ),
        dataPoints,
      },
    });
  });

  // GET /agent/yield - Aave positions
  app.get('/yield', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const positions = await getAavePositions();

      return reply.code(200).send({
        success: true,
        error: null,
        data: {
          positions: [{
            chain: PRIMARY_CHAIN,
            protocol: 'Aave V3',
            supplied: positions.totalCollateral.toString(),
            debt: positions.totalDebt.toString(),
            healthFactor: positions.healthFactor.toString(),
          }],
        },
      });
    } catch (error) {
      return reply.code(200).send({
        success: true,
        error: null,
        data: { positions: [] },
      });
    }
  });

  // GET /agent/services - Service stats
  app.get('/services', async (_request: FastifyRequest, reply: FastifyReply) => {
    const services = ['analyze', 'summarize', 'review', 'yield-oracle', 'price-feed', 'swap-quote', 'market-intel', 'price-history'] as const;
    const stats = [];

    for (const service of services) {
      const count = await prismaQuery.serviceRequest.count({
        where: { service, status: 'COMPLETED' },
      });
      const revenue = await prismaQuery.serviceRequest.aggregate({
        where: { service, status: 'COMPLETED' },
        _sum: { price: true },
      });
      const totalLlmCost = await prismaQuery.serviceRequest.aggregate({
        where: { service, status: 'COMPLETED' },
        _sum: { llmCost: true },
      });

      stats.push({
        name: service,
        price: SERVICE_PRICES[service].toString(),
        requestCount: count,
        totalRevenue: (revenue._sum.price || 0n).toString(),
        totalLlmCost: (totalLlmCost._sum.llmCost || 0n).toString(),
      });
    }

    return reply.code(200).send({ success: true, error: null, data: { services: stats } });
  });

  // GET /agent/states - State history for chart
  app.get('/states', async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit = '100' } = request.query as { limit?: string };

    const states = await prismaQuery.agentState.findMany({
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit, 10),
    });

    const serialized = states.map((s: any) => ({
      ...s,
      balanceUsdc: s.balanceUsdc.toString(),
      balanceUsdt: (s.balanceUsdt || 0n).toString(),
      balanceEth: s.balanceEth.toString(),
      monthlyBurn: s.monthlyBurn.toString(),
      aaveSupplied: s.aaveSupplied.toString(),
      totalEarned: s.totalEarned.toString(),
      totalSpent: s.totalSpent.toString(),
    }));

    return reply.code(200).send({ success: true, error: null, data: serialized });
  });

  // POST /agent/execute - Execute an action using Claude + MCP tools
  app.post('/execute', async (request: FastifyRequest, reply: FastifyReply) => {
    const { instruction } = request.body as { instruction?: string } || {};
    if (!instruction) {
      return reply.code(400).send({
        success: false,
        error: { code: 'MISSING_INSTRUCTION', message: 'instruction is required' },
        data: null,
      });
    }

    try {
      const result = await executeWithTools(instruction);
      return reply.code(200).send({ success: true, error: null, data: result });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: { code: 'EXECUTION_ERROR', message: String(error) },
        data: null,
      });
    }
  });

  // GET /agent/tools - MCP tools registered on the agent
  app.get('/tools', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const client = getMcpClient();
      if (!client) {
        return reply.code(200).send({ success: true, error: null, data: { tools: [], count: 0 } });
      }
      const { tools } = await client.listTools();
      const simplified = tools.map((t: any) => ({
        name: t.name,
        title: t.title || t.name,
        description: (t.description || '').split('\n')[0], // First line only
        readOnly: t.annotations?.readOnlyHint ?? null,
      }));
      return reply.code(200).send({ success: true, error: null, data: { tools: simplified, count: simplified.length } });
    } catch (error) {
      return reply.code(500).send({ success: false, error: { code: 'TOOLS_ERROR', message: String(error) }, data: null });
    }
  });

  // GET /agent/decisions - Recent AI decisions with reasoning
  app.get('/decisions', async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit = '10' } = request.query as { limit?: string };

    const decisions = await prismaQuery.agentTransaction.findMany({
      where: {
        type: 'SPEND_LLM',
        metadata: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit, 10),
    });

    const parsed = decisions.map((tx: any) => {
      let decision = null;
      try {
        const meta = typeof tx.metadata === 'string' ? JSON.parse(tx.metadata) : tx.metadata;
        decision = meta?.decision || meta;
      } catch {}

      return {
        id: tx.id,
        action: decision?.action || 'UNKNOWN',
        reasoning: decision?.reasoning || tx.description || '',
        details: decision?.details || null,
        yieldRouter: (() => {
          try {
            const meta = typeof tx.metadata === 'string' ? JSON.parse(tx.metadata) : tx.metadata;
            return meta?.yieldRouter || null;
          } catch { return null; }
        })(),
        llmCost: tx.amount.toString(),
        timestamp: tx.createdAt,
      };
    });

    return reply.code(200).send({ success: true, error: null, data: parsed });
  });

  // GET /agent/spark - Spark Lightning wallet info
  app.get('/spark', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getSparkAddress, getSparkBalance, getSparkAccount } = await import('../lib/wdk/index.ts');
      const address = await getSparkAddress();
      const balance = await getSparkBalance();

      let canReceiveLightning = false;
      try {
        const account = await getSparkAccount();
        canReceiveLightning = typeof (account as any).createLightningInvoice === 'function';
      } catch {}

      return reply.code(200).send({
        success: true,
        error: null,
        data: {
          address,
          balanceSats: balance.toString(),
          balanceBtc: (Number(balance) / 1e8).toFixed(8),
          network: process.env.SPARK_NETWORK || 'REGTEST',
          canReceiveLightning,
          features: ['zero-fee-transfers', 'lightning-invoices', 'lightning-payments', 'btc-l1-bridge'],
        },
      });
    } catch (error) {
      return reply.code(200).send({
        success: true,
        error: null,
        data: { address: '', balanceSats: '0', balanceBtc: '0.00000000', network: 'REGTEST', canReceiveLightning: false, features: [] },
      });
    }
  });

  // GET /agent/skill - OpenClaw agent skill (SKILL.md)
  app.get('/skill', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const skillPath = path.join(import.meta.dir, '..', '..', '..', 'skills', 'forage', 'SKILL.md');
      const content = fs.readFileSync(skillPath, 'utf-8');
      return reply.code(200).send({
        success: true,
        error: null,
        data: {
          format: 'agentskills',
          content,
          install: 'npx skills add tetherto/wdk-agent-skills',
          wdkSkill: 'Available at /skills/wdk/SKILL.md',
        },
      });
    } catch {
      return reply.code(200).send({
        success: true,
        error: null,
        data: {
          format: 'agentskills',
          content: '---\nname: forage\ndescription: Autonomous AI agent with WDK wallet. Sells services via x402.\n---\n\nVisit the repo for the full SKILL.md.',
          install: 'npx skills add tetherto/wdk-agent-skills',
        },
      });
    }
  });

  // POST /agent/reset - Kill switch / reset agent (requires secret)
  app.post('/reset', async (request: FastifyRequest, reply: FastifyReply) => {
    const { secret } = request.body as { secret?: string } || {};
    const expected = process.env.AGENT_RESET_SECRET || 'forage-reset';
    if (secret !== expected) {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Invalid reset secret' },
        data: null,
      });
    }
    resetAgent();
    return reply.code(200).send({ success: true, error: null, data: { message: 'Agent reset' } });
  });

  done();
};
