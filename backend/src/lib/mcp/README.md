# MCP Integration

Model Context Protocol integration giving Claude autonomous access to wallet operations, DeFi tools, pricing, on-chain identity, and agent-to-agent commerce.

## Files

| File | Purpose |
|------|---------|
| `index.ts` | WdkMcpServer setup, InMemoryTransport, Anthropic SDK bridge |
| `custom-tools.ts` | 6 custom tools: identity, yield, agent-to-agent |
| `logging.ts` | MCP operation logging |
| `prompts.ts` | MCP prompt definitions |
| `resources.ts` | MCP resource definitions |

## Architecture

```
Claude (Decision Engine / Services)
    |
    | anthropic.messages.create({ tools: mcpToolDefs })
    |
    v
Anthropic SDK MCP Bridge
    | mcpTools(tools, client)
    | Returns tools with .run() method
    |
    v
MCP Client (InMemoryTransport)
    | Auto-approves elicitation (autonomous agent)
    |
    v
WdkMcpServer (extends McpServer)
    |
    +-- WDK Wallet Tools (13)
    |     getAddress          Get wallet address for a chain
    |     getBalance          Get native balance (ETH)
    |     getTokenBalance     Get ERC-20 balance (USDC, USDT)
    |     getFeeRates         Get current gas fees
    |     sendTransaction     Send raw transaction
    |     transfer            Transfer tokens
    |     sign                Sign arbitrary message
    |     verify              Verify signature
    |     quoteSendTransaction  Estimate tx cost
    |     quoteTransfer       Estimate transfer cost
    |     getMaxSpendableBtc  Max spendable calculation
    |     getCurrentPrice     Bitfinex real-time price
    |     getHistoricalPrice  Bitfinex hourly candles (max 100 points, 365 days)
    |
    +-- Custom Identity Tools (2)
    |     getAgentIdentity    Query ERC-8004 registry for agent data
    |     verifyAgent         Verify wallet owns agent NFT
    |
    +-- Custom Yield Tools (3)
    |     getYieldPositions   All positions + rates across protocols
    |     supplyToAave        Supply USDC/USDT for yield
    |     withdrawFromAave    Pull tokens back to wallet
    |
    +-- Custom A2A Tools (1)
          payAndFetch         Pay 402-protected API, auto-handle payment
```

## Tool Flow (Decision Engine)

```
makeDecision() returns action (e.g., SUPPLY_AAVE)
    |
    v
executeDecisionAction() maps action to instruction string
    |  e.g., "Check USDC balance on base-sepolia. If > $2,
    |   supply $1 to Aave V3 using supplyToAave tool."
    |
    v
executeWithTools(instruction)
    |
    v
Claude processes with 19 MCP tools available
    |
    +-- Claude calls getTokenBalance("USDC", "base-sepolia")
    |     -> MCP server -> WDK -> on-chain balance
    |
    +-- Claude calls supplyToAave("1000000", "base-sepolia")
    |     -> MCP server -> yield-router -> Aave Pool contract
    |
    v
Return: { result, toolCalls[], inputTokens, outputTokens }
```

## Tool Registration Pattern

WDK toolkit tools use `ToolFunction` pattern:
```typescript
wdkMcpServer.registerTools([...WALLET_READ_TOOLS, ...WALLET_WRITE_TOOLS, ...PRICING_TOOLS]);
```

Custom tools use `server.registerTool()` directly with Zod schemas:
```typescript
server.registerTool('toolName', {
  title: 'Tool Title',
  description: 'What it does...',
  inputSchema: z.object({ param: z.string() }),
  annotations: { readOnlyHint: true, destructiveHint: false },
}, async ({ param }) => {
  return { content: [{ type: 'text', text: result }], structuredContent: { ... } };
});
```

## Key Integration: WDK Monkey-Patch

The `WdkMcpServer` API only accepts a seed phrase via `useWdk()`. Since we already have an initialized WDK instance, we inject it directly:

```typescript
const wdkMcpServer = new WdkMcpServer('survival-agent-wdk', '1.0.0');
(wdkMcpServer as any)._wdk = wdk;  // Inject existing WDK
```

## InMemoryTransport

No network latency. Client and server communicate in-process:

```typescript
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await wdkMcpServer.connect(serverTransport);
await mcpClient.connect(clientTransport);
```

## Elicitation Auto-Approval

Write tools (sendTransaction, transfer, supplyToAave) trigger MCP elicitation prompts. For autonomous operation, we auto-approve:

```typescript
mcpClient.setRequestHandler(
  ElicitRequestSchema,
  async () => ({ action: 'accept', content: { confirmed: 'true' } }),
);
```

This enables fully autonomous operation while maintaining the MCP safety protocol.
