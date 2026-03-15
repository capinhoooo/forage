import { describe, test, expect, beforeAll } from 'bun:test';

/**
 * E2E Smoke Tests: verify all API endpoints return valid responses.
 * Run with the backend already running: bun test tests/e2e-smoke.test.ts
 *
 * These tests hit the live server (localhost:3700) and verify:
 * - All agent endpoints respond with success
 * - Service endpoints return 402 (payment required)
 * - Discovery endpoint returns valid catalog
 * - Spark endpoint responds
 * - Decisions endpoint responds
 */

const BASE = process.env.API_URL || 'http://localhost:3700';

async function fetchJson(path: string) {
  const res = await fetch(`${BASE}${path}`);
  const json = await res.json();
  return { status: res.status, json, headers: res.headers };
}

describe('E2E: Health Check', () => {
  test('GET / returns success', async () => {
    const { json } = await fetchJson('/');
    expect(json.success).toBe(true);
  });
});

describe('E2E: Agent Endpoints', () => {
  test('GET /agent/status returns valid state', async () => {
    const { json } = await fetchJson('/agent/status');
    expect(json.success).toBe(true);
    expect(json.data.state).toBeDefined();
    expect(['THRIVING', 'STABLE', 'CAUTIOUS', 'DESPERATE', 'CRITICAL', 'DEAD']).toContain(json.data.state);
    expect(json.data.walletAddress).toMatch(/^0x/);
    expect(json.data.balanceUsdc).toBeDefined();
    expect(json.data.lifeMeter).toBeGreaterThanOrEqual(0);
    expect(json.data.explorerUrl).toContain('basescan');
  });

  test('GET /agent/status includes Spark fields', async () => {
    const { json } = await fetchJson('/agent/status');
    expect(json.data).toHaveProperty('sparkAddress');
    expect(json.data).toHaveProperty('sparkBalance');
  });

  test('GET /agent/status includes WDK modules list', async () => {
    const { json } = await fetchJson('/agent/status');
    if (json.data.wdkModules) {
      expect(json.data.wdkModules).toContain('@tetherto/wdk');
      expect(json.data.wdkModules).toContain('@tetherto/wdk-wallet-spark');
      expect(json.data.wdkModules.length).toBeGreaterThanOrEqual(10);
    }
  });

  test('GET /agent/history returns array', async () => {
    const { json } = await fetchJson('/agent/history');
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });

  test('GET /agent/pnl returns financials', async () => {
    const { json } = await fetchJson('/agent/pnl?period=24h');
    expect(json.success).toBe(true);
    expect(json.data.period).toBe('24h');
    expect(json.data.revenue).toBeDefined();
    expect(json.data.costs).toBeDefined();
    expect(json.data.net).toBeDefined();
  });

  test('GET /agent/yield returns positions', async () => {
    const { json } = await fetchJson('/agent/yield');
    expect(json.success).toBe(true);
    expect(json.data.positions).toBeDefined();
  });

  test('GET /agent/services returns service stats', async () => {
    const { json } = await fetchJson('/agent/services');
    expect(json.success).toBe(true);
    const names = json.data.services.map((s: any) => s.name);
    expect(names).toContain('analyze');
    expect(names).toContain('summarize');
    expect(names).toContain('yield-oracle');
    expect(names).toContain('price-feed');
    expect(json.data.services.length).toBe(8);
  });

  test('GET /agent/decisions returns array', async () => {
    const { json } = await fetchJson('/agent/decisions?limit=5');
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });

  test('GET /agent/spark returns Spark info', async () => {
    const { json } = await fetchJson('/agent/spark');
    expect(json.success).toBe(true);
    expect(json.data.network).toBeDefined();
    expect(json.data.features).toContain('zero-fee-transfers');
    expect(json.data.features).toContain('lightning-invoices');
  });

  test('GET /agent/tools returns MCP tool list', async () => {
    const { json } = await fetchJson('/agent/tools');
    expect(json.success).toBe(true);
    expect(json.data.count).toBeGreaterThan(20);
    const toolNames = json.data.tools.map((t: any) => t.name);
    expect(toolNames).toContain('getBalance');
    expect(toolNames).toContain('supplyToAave');
  });

  test('GET /agent/states returns snapshots', async () => {
    const { json } = await fetchJson('/agent/states?limit=5');
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });
});

describe('E2E: Paid Services (402 Response)', () => {
  const services = ['analyze', 'summarize', 'review', 'yield-oracle', 'price-feed', 'swap-quote', 'market-intel', 'price-history'];

  for (const service of services) {
    test(`GET /services/${service} returns 402`, async () => {
      let query = '';
      switch (service) {
        case 'analyze': query = '?data=test'; break;
        case 'summarize': query = '?text=test'; break;
        case 'review': query = '?code=test&language=typescript'; break;
        case 'price-feed': query = '?from=ETH'; break;
        case 'swap-quote': query = '?tokenIn=0x1&tokenOut=0x2&amount=1'; break;
        case 'price-history': query = '?from=ETH&days=7'; break;
      }

      const res = await fetch(`${BASE}/services/${service}${query}`);
      expect(res.status).toBe(402);

      // Verify 402 response has payment info
      const body = await res.json();
      const hasPaymentHeader = res.headers.has('payment-required');
      const hasT402Body = !!body.t402PaymentRequired;
      expect(hasPaymentHeader || hasT402Body).toBe(true);
    });
  }
});

describe('E2E: Discovery', () => {
  test('GET /.well-known/t402/discovery returns catalog', async () => {
    const { json } = await fetchJson('/.well-known/t402/discovery');
    expect(json.success).toBe(true);
    expect(json.data.agent).toBeDefined();
    expect(json.data.agent.name).toContain('Forage');
    expect(json.data.services.length).toBeGreaterThan(0);
  });

  test('GET /.well-known/t402/services returns service list', async () => {
    const { json } = await fetchJson('/.well-known/t402/services');
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBe(8);
  });
});
