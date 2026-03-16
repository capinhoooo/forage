# API Routes

All API endpoints follow the standard response format:
```json
{ "success": true, "error": null, "data": { ... } }
```

## Files

| File | Purpose |
|------|---------|
| `agentRoutes.ts` | 8 agent management endpoints (no payment required) |
| `serviceRoutes.ts` | 8 paid service endpoints (x402 payment required) |
| `discoveryRoutes.ts` | 2 Bazaar discovery endpoints (service catalog) |

## Request Flow

```
Client
  |
  +-- /agent/* -----------> agentRoutes.ts (direct handler, no auth)
  |
  +-- /services/* --------> Payment Middleware
  |                            |
  |                            +-- No payment? 402 with Bazaar + ERC-8004
  |                            +-- Valid payment? Execute service + settle
  |                            |
  |                         serviceRoutes.ts (service handler)
  |
  +-- /.well-known/t402/* -> discoveryRoutes.ts (catalog, no auth)
```

## Agent Routes (`/agent/*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/agent/status` | GET | Full agent status: state, balances (USDC + USDT), runway, yield positions, rates, identity, Spark wallet, WDK modules |
| `/agent/history` | GET | Transaction history (pagination: `limit`, `offset`, `type` filter) |
| `/agent/pnl` | GET | P&L breakdown by period (`1h`, `24h`, `7d`, `30d`) with hourly chart data. Only counts real costs (LLM, gas), not DeFi movements |
| `/agent/yield` | GET | DeFi positions (USDC + USDT across Aave, Compound, Morpho) |
| `/agent/services` | GET | Per-service stats: request count, total revenue, total LLM cost |
| `/agent/decisions` | GET | AI decision history with reasoning, action, yield router result (`limit` param) |
| `/agent/states` | GET | State history snapshots for timeline visualization |
| `/agent/spark` | GET | Spark Lightning wallet info: address, balance (sats/BTC), network, Lightning capabilities |
| `/agent/skill` | GET | OpenClaw agent skill (SKILL.md) for agent-to-agent discovery |
| `/agent/tools` | GET | List of all MCP tools registered on the agent |
| `/agent/execute` | POST | Execute instruction via Claude + 34 MCP tools |
| `/agent/reset` | POST | Kill switch (requires `AGENT_RESET_SECRET`) |

## Service Routes (`/services/*`)

Protected by x402/t402 payment middleware. Payment is verified before service execution, settled on-chain after.

### AI Services (Dynamic Pricing)

| Endpoint | Method | Base Price | Dynamic | Description |
|----------|--------|-----------|---------|-------------|
| `/services/analyze` | GET | $0.05 | +$0.000015/char > 200 | AI data analysis with on-chain enrichment |
| `/services/summarize` | GET | $0.02 | +$0.000008/char > 300 | Text summarization |
| `/services/review` | GET | $0.10 | +$0.000025/char > 500 | Code review with smart contract verification |

### DeFi Data Services (Flat Rate)

| Endpoint | Method | Price | Description |
|----------|--------|-------|-------------|
| `/services/yield-oracle` | GET | $0.01 | Live on-chain APYs (Aave, Compound, Morpho) |
| `/services/price-feed` | GET | $0.005 | Bitfinex real-time price (10 assets) |
| `/services/swap-quote` | GET | $0.005 | Velora DEX aggregator quote (read-only) |
| `/services/market-intel` | GET | $0.03 | AI-enhanced DeFi brief (prices + yields + Claude) |
| `/services/price-history` | GET | $0.01 | Historical Bitfinex data + trend analysis |

Each service response includes `toolsUsed[]` (AI services) or structured data (DeFi services). All 402 responses include Bazaar discovery extensions.

## Discovery Routes (`/.well-known/t402/*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/.well-known/t402/discovery` | GET | Full catalog: agent info, all 8 services with Bazaar extensions, capabilities |
| `/.well-known/t402/services` | GET | Simplified service list with paths, methods, prices |

The discovery catalog includes:
- Agent name, description, ERC-8004 identity
- Supported protocols: x402, t402
- Per-service Bazaar extensions (input schemas, output examples)
- Supported chains, schemes, and payment extensions
