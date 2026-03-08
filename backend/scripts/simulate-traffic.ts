#!/usr/bin/env bun
/**
 * Simulate external agent traffic buying Forage services.
 * Calls each paid service endpoint with realistic data, handles 402 payment flow.
 *
 * Usage:
 *   bun run scripts/simulate-traffic.ts                    # Run once (all services)
 *   bun run scripts/simulate-traffic.ts --loop              # Continuous loop
 *   bun run scripts/simulate-traffic.ts --loop --interval 30 # Loop every 30s
 *   bun run scripts/simulate-traffic.ts --service summarize  # Single service
 */
import '../dotenv.ts';

const { APP_PORT } = await import('../src/config/main-config.ts');
const { SERVICE_PRICES } = await import('../src/lib/wdk/config.ts');
const { paidFetch } = await import('../src/lib/payment/payment-client.ts');

const BASE = `http://localhost:${APP_PORT}`;

// Parse CLI args
const args = process.argv.slice(2);
const isLoop = args.includes('--loop');
const intervalIdx = args.indexOf('--interval');
const intervalSec = intervalIdx !== -1 ? parseInt(args[intervalIdx + 1], 10) : 60;
const serviceIdx = args.indexOf('--service');
const onlyService = serviceIdx !== -1 ? args[serviceIdx + 1] : null;

// Service definitions with realistic test data
const SERVICE_CALLS = [
  {
    name: 'summarize',
    url: `/services/summarize?text=${encodeURIComponent('The autonomous DeFi agent landscape is evolving rapidly. Agents now manage their own wallets, earn through micropayments, and deploy surplus capital into yield protocols. Key trends include x402 payment standards, WDK wallet integration, and multi-protocol yield routing across Aave, Compound, and Morpho.')}`,
    extract: (d: any) => d.summary?.slice(0, 120) + '...',
  },
  {
    name: 'analyze',
    url: `/services/analyze?data=${encodeURIComponent('USDC APY: Aave 3.2%, Compound 2.8%, Morpho 4.1%. ETH price trending up 2.3% 24h. Gas fees averaging 12 gwei on Base.')}`,
    extract: (d: any) => d.analysis?.slice(0, 120) + '...',
  },
  {
    name: 'review',
    url: `/services/review?code=${encodeURIComponent('async function supply(amount: bigint) {\n  const tx = await pool.supply(token, amount, address, 0);\n  return tx.hash;\n}')}&language=typescript`,
    extract: (d: any) => `Score: ${d.score}/10`,
  },
  {
    name: 'yield-oracle',
    url: '/services/yield-oracle',
    extract: (d: any) => `${d.rates?.length || 0} protocols`,
  },
  {
    name: 'price-feed',
    url: '/services/price-feed?from=ETH&to=USD',
    extract: (d: any) => `ETH = $${d.price}`,
  },
  {
    name: 'swap-quote',
    url: '/services/swap-quote?tokenIn=USDC&tokenOut=ETH&amount=1000000',
    extract: (d: any) => d.quote ? `Quote: ${JSON.stringify(d.quote).slice(0, 80)}` : 'Quote received',
  },
  {
    name: 'market-intel',
    url: '/services/market-intel?tokens=ETH,BTC',
    extract: (d: any) => d.brief?.slice(0, 120) + '...',
  },
  {
    name: 'price-history',
    url: '/services/price-history?from=ETH&to=USD&days=7',
    extract: (d: any) => `${d.points?.length || 0} data points, trend: ${d.trend || 'n/a'}`,
  },
];

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callService(svc: typeof SERVICE_CALLS[0]) {
  const price = SERVICE_PRICES[svc.name as keyof typeof SERVICE_PRICES];
  const priceStr = price ? `$${(price / 1e6).toFixed(4)}` : '$?.????';

  process.stdout.write(`  [${svc.name}] ${priceStr} ... `);

  try {
    const start = Date.now();
    const response = await paidFetch(`${BASE}${svc.url}`);
    const elapsed = Date.now() - start;
    const paid = response.headers.has('payment-response');

    if (response.ok) {
      const body = await response.json() as any;
      const preview = body.data ? svc.extract(body.data) : 'OK';
      console.log(`${response.status} ${paid ? 'PAID' : 'FREE'} (${elapsed}ms) ${preview}`);
      return true;
    } else {
      const text = await response.text();
      console.log(`${response.status} FAIL (${elapsed}ms) ${text.slice(0, 100)}`);
      return false;
    }
  } catch (err) {
    console.log(`ERROR: ${String(err).slice(0, 100)}`);
    return false;
  }
}

async function runCycle(cycleNum: number) {
  const services = onlyService
    ? SERVICE_CALLS.filter(s => s.name === onlyService)
    : SERVICE_CALLS;

  if (services.length === 0) {
    console.log(`Unknown service: ${onlyService}`);
    process.exit(1);
  }

  const timestamp = new Date().toLocaleTimeString();
  console.log(`\n[Cycle ${cycleNum}] ${timestamp} | ${services.length} services`);
  console.log('─'.repeat(60));

  let success = 0;
  let fail = 0;

  for (const svc of services) {
    const ok = await callService(svc);
    if (ok) success++; else fail++;
    // Small delay between calls to avoid hammering
    if (services.length > 1) await sleep(2000);
  }

  console.log(`${'─'.repeat(60)}`);
  console.log(`Results: ${success} success, ${fail} failed`);

  // Show total cost
  const totalCost = services.reduce((sum, s) => {
    const price = SERVICE_PRICES[s.name as keyof typeof SERVICE_PRICES] || 0;
    return sum + price;
  }, 0);
  console.log(`Total spent: $${(totalCost / 1e6).toFixed(4)} USDC`);
}

// Main
console.log('=== Forage Traffic Simulator ===');
console.log(`Target: ${BASE}`);
console.log(`Mode: ${isLoop ? `Loop every ${intervalSec}s` : 'Single run'}`);
if (onlyService) console.log(`Service: ${onlyService}`);

// Check server is up
try {
  const res = await fetch(`${BASE}/agent/status`);
  if (!res.ok) throw new Error(`Status ${res.status}`);
  const { data } = await res.json() as any;
  console.log(`Agent: ${data.state} | Balance: $${(data.balanceUsdc / 1e6).toFixed(2)} USDC`);
} catch {
  console.log('\nAgent not reachable. Start with: cd backend && bun dev');
  process.exit(1);
}

let cycle = 1;
await runCycle(cycle);

if (isLoop) {
  while (true) {
    await sleep(intervalSec * 1000);
    cycle++;
    await runCycle(cycle);
  }
}

console.log('\n=== Done ===');
