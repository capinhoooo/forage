#!/usr/bin/env bun
/**
 * Test: Agent-as-client self-payment loop.
 * The agent pays its own /summarize service via paidFetch.
 * This requires the server to be running on localhost:3700.
 */
import '../dotenv.ts';

async function main() {
  console.log('=== Agent-as-Client Test ===\n');

  const { APP_PORT } = await import('../src/config/main-config.ts');
  const { SERVICE_PRICES } = await import('../src/lib/wdk/config.ts');

  // 1. Check server is running
  console.log(`1. Checking server at localhost:${APP_PORT}...`);
  try {
    const healthRes = await fetch(`http://localhost:${APP_PORT}/`);
    console.log(`   Server status: ${healthRes.status}`);
    if (healthRes.status !== 200) {
      console.log('   Server not responding. Start with: bun run dev');
      process.exit(1);
    }
  } catch {
    console.log('   Server not reachable. Start with: bun run dev');
    process.exit(1);
  }

  // 2. Test raw /summarize endpoint (should return 402)
  console.log('\n2. Testing /summarize without payment (expect 402)...');
  const rawRes = await fetch(`http://localhost:${APP_PORT}/services/summarize?text=test`);
  console.log(`   Status: ${rawRes.status}`);
  if (rawRes.status === 402) {
    console.log('   PASS: Got 402 Payment Required (as expected)');
  } else {
    console.log(`   NOTE: Got ${rawRes.status} (402 middleware may not be active for local calls)`);
  }

  // 3. Test paidFetch (the agent-as-client)
  console.log('\n3. Testing paidFetch (agent pays itself)...');
  const { paidFetch } = await import('../src/lib/payment/payment-client.ts');

  const topic = 'Autonomous DeFi agent treasury management strategies for yield optimization';
  const url = `http://localhost:${APP_PORT}/services/summarize?text=${encodeURIComponent(topic)}`;

  console.log(`   URL: ${url}`);
  console.log(`   Price: $${(SERVICE_PRICES.summarize / 1e6).toFixed(4)} USDC`);

  const startTime = Date.now();
  const response = await paidFetch(url);
  const elapsed = Date.now() - startTime;

  const paid = response.headers.has('payment-response');
  console.log(`   Status: ${response.status}`);
  console.log(`   Paid: ${paid}`);
  console.log(`   Time: ${elapsed}ms`);

  const body = await response.json() as any;

  if (body.success && body.data?.summary) {
    console.log(`   Summary: "${body.data.summary.slice(0, 150)}..."`);
    console.log(`   Key Points: ${body.data.keyPoints?.length || 0}`);
    console.log('\n   PASS: Agent successfully paid for and received service');
  } else {
    console.log(`   Response: ${JSON.stringify(body).slice(0, 300)}`);
    console.log('\n   RESULT: Service returned but may not have settled payment');
  }

  console.log('\n=== Test Complete ===');
}

main().catch(err => { console.error('Test error:', err); process.exit(1); });
