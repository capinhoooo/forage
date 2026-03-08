/**
 * Test: WDK MCP Toolkit integration
 * Verifies in-memory MCP transport, tool listing, and basic tool calls.
 */
import '../dotenv.ts';
import { initMcpToolkit, getAnthropicMcpTools, disposeMcpToolkit } from '../src/lib/mcp/index.ts';

async function main() {
  console.log('=== WDK MCP Toolkit Test ===\n');

  // 1. Initialize MCP
  console.log('[1] Initializing MCP toolkit...');
  const client = await initMcpToolkit();
  const { tools } = await client.listTools();
  console.log(`    Tools available: ${tools.length}`);
  for (const tool of tools) {
    console.log(`    - ${tool.name}: ${tool.description?.slice(0, 60) || 'no description'}`);
  }

  // 2. Call getAddress tool
  console.log('\n[2] Calling getAddress...');
  const addrResult = await client.callTool({ name: 'getAddress', arguments: { chain: 'base-sepolia' } });
  console.log('    Result:', JSON.stringify(addrResult.content));

  // 3. Call getBalance tool
  console.log('\n[3] Calling getBalance...');
  const balResult = await client.callTool({ name: 'getBalance', arguments: { chain: 'base-sepolia' } });
  console.log('    Result:', JSON.stringify(balResult.content));

  // 4. Call getTokenBalance
  console.log('\n[4] Calling getTokenBalance (USDC)...');
  const tokenResult = await client.callTool({ name: 'getTokenBalance', arguments: { chain: 'base-sepolia', token: 'USDC' } });
  console.log('    Result:', JSON.stringify(tokenResult.content));

  // 5. Call getCurrentPrice
  console.log('\n[5] Calling getCurrentPrice (ETH/USD)...');
  const priceResult = await client.callTool({ name: 'getCurrentPrice', arguments: { base: 'ETH', quote: 'USD' } });
  console.log('    Result:', JSON.stringify(priceResult.content));

  // 6. Get Anthropic-formatted tools
  console.log('\n[6] Getting Anthropic-formatted MCP tools...');
  const anthropicTools = await getAnthropicMcpTools();
  console.log(`    Anthropic tools: ${anthropicTools.length}`);
  for (const t of anthropicTools) {
    console.log(`    - ${t.name} (${t.type})`);
  }

  // 7. Cleanup
  await disposeMcpToolkit();
  console.log('\n=== MCP Toolkit Test Complete ===');
}

main().catch(console.error);
