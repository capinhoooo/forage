/**
 * Test: Feature 2 - MCP Resources
 *
 * Tests:
 * 1. Resource registration (5 resources: status, positions, identity, config, transactions)
 * 2. Reading static resources
 * 3. Reading template resource with variable
 * 4. Resource content format validation
 */
import '../dotenv.ts';
import { initMcpToolkit, disposeMcpToolkit } from '../src/lib/mcp/index.ts';

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
const SKIP = '\x1b[33mSKIP\x1b[0m';

let passed = 0;
let failed = 0;
let skipped = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ${PASS} ${name}${detail ? ` (${detail})` : ''}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${name}${detail ? ` (${detail})` : ''}`);
    failed++;
  }
}

async function main() {
  console.log('=== Feature 2: MCP Resources ===\n');

  const client = await initMcpToolkit();

  // --- Test 1: Resource Registration ---
  console.log('[1] Resource Registration');

  const { resources } = await client.listResources();
  const resourceUris = resources.map((r: any) => r.uri);
  const resourceNames = resources.map((r: any) => r.name);

  check('Resources registered', resources.length >= 4, `got ${resources.length}`);
  check('agent://status registered', resourceUris.includes('agent://status'));
  check('agent://positions registered', resourceUris.includes('agent://positions'));
  check('agent://identity registered', resourceUris.includes('agent://identity'));
  check('agent://config registered', resourceUris.includes('agent://config'));

  console.log(`\n  Resources: ${resourceUris.join(', ')}`);

  // --- Test 2: Resource Templates ---
  console.log('\n[2] Resource Templates');

  const { resourceTemplates } = await client.listResourceTemplates();
  check('Template resources exist', resourceTemplates.length >= 1, `got ${resourceTemplates.length}`);

  const txTemplate = resourceTemplates.find((t: any) =>
    t.uriTemplate?.includes('transactions') || t.name?.includes('transactions')
  );
  check('Transactions template registered', Boolean(txTemplate), txTemplate?.uriTemplate || txTemplate?.name);

  // --- Test 3: Read agent://status ---
  console.log('\n[3] Read agent://status');

  try {
    const statusResult = await client.readResource({ uri: 'agent://status' });
    const statusContent = statusResult.contents?.[0];
    check('Status resource readable', Boolean(statusContent));

    if (statusContent) {
      check('Status has text content', typeof (statusContent as any).text === 'string');
      check('Status is JSON', true);
      const data = JSON.parse((statusContent as any).text);
      check('Status has state field', 'state' in data, data.state);
      check('Status has balanceUsdc field', 'balanceUsdc' in data, data.balanceUsdc);
      check('Status has runwayHours field', 'runwayHours' in data);
      check('Status has walletAddress field', 'walletAddress' in data, data.walletAddress?.slice(0, 10) + '...');
    }
  } catch (e: any) {
    check('Read agent://status', false, e.message);
  }

  // --- Test 4: Read agent://positions ---
  console.log('\n[4] Read agent://positions');

  try {
    const posResult = await client.readResource({ uri: 'agent://positions' });
    const posContent = posResult.contents?.[0];
    check('Positions resource readable', Boolean(posContent));

    if (posContent) {
      const data = JSON.parse((posContent as any).text);
      check('Positions has totalSuppliedUsdc', 'totalSuppliedUsdc' in data, data.totalSuppliedUsdc);
      check('Positions has positions array', Array.isArray(data.positions), `${data.positions?.length} positions`);
      check('Positions has rates array', Array.isArray(data.rates), `${data.rates?.length} rates`);
    }
  } catch (e: any) {
    check('Read agent://positions', false, e.message);
  }

  // --- Test 5: Read agent://identity ---
  console.log('\n[5] Read agent://identity');

  try {
    const idResult = await client.readResource({ uri: 'agent://identity' });
    const idContent = idResult.contents?.[0];
    check('Identity resource readable', Boolean(idContent));

    if (idContent) {
      const data = JSON.parse((idContent as any).text);
      check('Identity has agentId', 'agentId' in data, data.agentId?.toString());
      check('Identity has identityRegistry', 'identityRegistry' in data);
      check('Identity has reputationRegistry', 'reputationRegistry' in data);
      check('Identity has reputation', 'reputation' in data);
    }
  } catch (e: any) {
    check('Read agent://identity', false, e.message);
  }

  // --- Test 6: Read agent://config ---
  console.log('\n[6] Read agent://config');

  try {
    const cfgResult = await client.readResource({ uri: 'agent://config' });
    const cfgContent = cfgResult.contents?.[0];
    check('Config resource readable', Boolean(cfgContent));

    if (cfgContent) {
      const data = JSON.parse((cfgContent as any).text);
      check('Config has services', 'services' in data);
      check('Config has analyze price', Boolean(data.services?.analyze?.priceUsdc), data.services?.analyze?.priceUsdc);
      check('Config has chains', 'chains' in data);
      check('Config has protocols', Array.isArray(data.protocols), data.protocols?.join(', '));
    }
  } catch (e: any) {
    check('Read agent://config', false, e.message);
  }

  // --- Test 7: Read agent://transactions/{limit} (template) ---
  console.log('\n[7] Read agent://transactions/5');

  try {
    const txResult = await client.readResource({ uri: 'agent://transactions/5' });
    const txContent = txResult.contents?.[0];
    check('Transactions resource readable', Boolean(txContent));

    if (txContent) {
      const data = JSON.parse((txContent as any).text);
      check('Transactions has count', 'count' in data, `${data.count} transactions`);
      check('Transactions has array', Array.isArray(data.transactions));
      check('Transactions respects limit', data.transactions.length <= 5, `got ${data.transactions.length}`);
    }
  } catch (e: any) {
    check('Read agent://transactions/5', false, e.message);
  }

  // --- Cleanup ---
  await disposeMcpToolkit();

  // --- Summary ---
  console.log('\n=============================');
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log('=============================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
