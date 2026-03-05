import { describe, test, expect } from 'bun:test';

/**
 * API endpoint integration tests.
 * These test the actual HTTP server responses.
 * Requires the server to be running on localhost:3700.
 *
 * Run: bun test tests/api-endpoints.test.ts
 * (start server first: bun dev)
 */

const BASE = process.env.TEST_API_URL || 'http://localhost:3700';

async function fetchJson(path: string) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, headers: res.headers, body: await res.json() };
}

describe('Health Check', () => {
  test('GET / returns alive', async () => {
    const { status, body } = await fetchJson('/');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Forage is alive.');
  });
});

describe('Agent API (no payment required)', () => {
  test('GET /agent/status returns agent state', async () => {
    const { status, body } = await fetchJson('/agent/status');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();

    const data = body.data;
    expect(data.state).toMatch(/^(THRIVING|STABLE|CAUTIOUS|DESPERATE|CRITICAL|DEAD)$/);
    expect(data.walletAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(typeof data.balanceUsdc).toBe('string');
    expect(typeof data.balanceUsdt).toBe('string');
    expect(typeof data.runway).toBe('number');
    expect(typeof data.lifeMeter).toBe('number');
    expect(data.lifeMeter).toBeGreaterThanOrEqual(0);
    expect(data.lifeMeter).toBeLessThanOrEqual(100);
    expect(typeof data.uptimeSeconds).toBe('number');
    expect(data.chain).toBe('base-sepolia');
  });

  test('GET /agent/history returns array', async () => {
    const { status, body } = await fetchJson('/agent/history');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('GET /agent/pnl returns revenue/costs breakdown', async () => {
    const { status, body } = await fetchJson('/agent/pnl?period=24h');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(typeof body.data.revenue).toBe('string');
    expect(typeof body.data.costs).toBe('string');
    expect(typeof body.data.net).toBe('string');
    expect(Array.isArray(body.data.dataPoints)).toBe(true);
  });

  test('GET /agent/states returns state history', async () => {
    const { status, body } = await fetchJson('/agent/states?limit=10');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('GET /agent/services returns 8 services', async () => {
    const { status, body } = await fetchJson('/agent/services');
    expect(status).toBe(200);
    expect(body.success).toBe(true);

    const services = body.data.services;
    expect(services.length).toBe(8);

    const names = services.map((s: any) => s.name);
    expect(names).toContain('analyze');
    expect(names).toContain('summarize');
    expect(names).toContain('review');
    expect(names).toContain('yield-oracle');
    expect(names).toContain('price-feed');
    expect(names).toContain('swap-quote');
    expect(names).toContain('market-intel');
    expect(names).toContain('price-history');

    // Each service should have price info
    for (const svc of services) {
      expect(typeof svc.price).toBe('string');
      expect(Number(svc.price)).toBeGreaterThan(0);
    }
  });
});

describe('Paid Services (402 payment flow)', () => {
  test('GET /services/analyze returns 402 without payment', async () => {
    const res = await fetch(`${BASE}/services/analyze?input=test`);
    // Should return 402 Payment Required
    expect(res.status).toBe(402);
  });

  test('GET /services/summarize returns 402 without payment', async () => {
    const res = await fetch(`${BASE}/services/summarize?input=test`);
    expect(res.status).toBe(402);
  });

  test('GET /services/yield-oracle returns 402 without payment', async () => {
    const res = await fetch(`${BASE}/services/yield-oracle`);
    expect(res.status).toBe(402);
  });

  test('GET /services/price-feed returns 402 without payment', async () => {
    const res = await fetch(`${BASE}/services/price-feed?from=BTC`);
    expect(res.status).toBe(402);
  });

  test('402 response includes payment requirements', async () => {
    const res = await fetch(`${BASE}/services/summarize?input=test`);
    expect(res.status).toBe(402);

    const body = await res.json();
    // Should have payment info (x402 format)
    expect(body).toBeDefined();
  });
});

describe('Bazaar Discovery', () => {
  test('GET /.well-known/t402/discovery returns agent catalog', async () => {
    const { status, body } = await fetchJson('/.well-known/t402/discovery');
    expect(status).toBe(200);
    expect(body.success).toBe(true);

    const data = body.data;
    expect(data.agent.name).toBe('Forage');
    expect(data.agent.protocols).toContain('x402');
    expect(data.agent.protocols).toContain('t402');
    expect(Array.isArray(data.services)).toBe(true);
    expect(data.services.length).toBe(8);
    expect(data.capabilities.chains).toContain('eip155:84532');
  });

  test('GET /.well-known/t402/services returns service list', async () => {
    const { status, body } = await fetchJson('/.well-known/t402/services');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.services.length).toBe(8);

    // Verify all service paths
    const paths = body.data.services.map((s: any) => s.path);
    expect(paths).toContain('/services/analyze');
    expect(paths).toContain('/services/summarize');
    expect(paths).toContain('/services/review');
    expect(paths).toContain('/services/yield-oracle');
    expect(paths).toContain('/services/price-feed');
    expect(paths).toContain('/services/swap-quote');
    expect(paths).toContain('/services/market-intel');
    expect(paths).toContain('/services/price-history');
  });
});
