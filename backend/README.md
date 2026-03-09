# Forage Backend

Bun + Fastify 5 server powering the autonomous AI agent. This is the agent itself: it earns, decides, invests, and adapts.

## Quick Start

```bash
cp .env.example .env    # Configure environment
bun install             # Install dependencies
bun run db:push         # Initialize PostgreSQL schema
bun run dev             # Start on port 3700
bun test                # Run 59 unit tests
```

## Architecture

```
index.ts (Entry Point)
  |
  +-- Fastify Server (port 3700)
  |     |
  |     +-- /agent/*            (agentRoutes.ts)       8 endpoints, no auth
  |     +-- /services/*         (serviceRoutes.ts)     8 endpoints, x402 payment
  |     +-- /.well-known/t402/* (discoveryRoutes.ts)   Bazaar service catalog
  |     +-- /                   (health check)
  |
  +-- Payment Layer
  |     x402 + t402 protocol detection from headers
  |     Embedded local facilitators (zero external deps)
  |     EIP-3009 on-chain settlement
  |     Bazaar discovery extensions on all 402 responses
  |     ERC-8004 identity in payment responses
  |     Agent-as-client via paidFetch()
  |
  +-- Agent Brain
  |     Decision engine (Claude Haiku/Sonnet + 19 MCP tools)
  |     Context caching (hash 8 fields, skip LLM when unchanged)
  |     Adaptive loop (2 to 15 min based on state urgency)
  |     Lightweight pre-check (skip loop if nothing changed)
  |     State machine (THRIVING > STABLE > CAUTIOUS > DESPERATE > CRITICAL > DEAD)
  |     8 actions: HOLD, SUPPLY_AAVE, WITHDRAW_AAVE, ADJUST_PRICING,
  |               REDUCE_COSTS, EMERGENCY, GATHER_INTELLIGENCE, SWAP_TOKENS
  |
  +-- Yield Router
  |     Multi-token: USDC + USDT routed independently
  |     Multi-protocol: Aave V3, Compound V3, Morpho Blue
  |     Multi-chain: Base Sepolia + Ethereum Sepolia
  |     On-chain APY queries, gas-aware rebalancing, protocol fallback
  |
  +-- Workers
  |     agentLoop.ts      (adaptive setTimeout: 2-15 min decision cycle)
  |     errorLogCleanup   (hourly: cap error logs at 10k)
  |
  +-- WDK Wallet
        7 WDK modules initialized on startup
        EOA (Base Sepolia) + 4337 Smart Account (Eth Sepolia)
        T402WDK wrapper for payment signing
        Bitfinex pricing (real-time + historical)
        Velora DEX (swap quotes + execution)
```

## Request Flow

```
Client Request
    |
    v
Fastify Route Match
    |
    +-- /agent/* --> Direct handler (no payment)
    |
    +-- /services/* --> Payment middleware
    |     |
    |     +-- No payment header?
    |     |     Return 402 with:
    |     |       x402 headers (price, token, payTo)
    |     |       Bazaar discovery (input/output schemas)
    |     |       ERC-8004 identity
    |     |
    |     +-- Has payment header?
    |           Detect protocol (x402 vs t402)
    |           Verify signature via embedded facilitator
    |           Execute service (Claude + MCP tools)
    |           Settle payment on-chain (EIP-3009)
    |           Log earning + service request
    |           Return 200 with result
    |
    +-- /.well-known/t402/* --> Discovery catalog (no payment)
```

## Directory Structure

```
backend/
  index.ts                    # Entry point
  prisma/schema.prisma        # Database models
  tests/                      # Unit tests (Bun test runner)
    decision-engine.test.ts   # Context hashing, caching, actions
    loop-state.test.ts        # Adaptive interval state transitions
    service-pricing.test.ts   # Base + dynamic pricing for all services
    discovery.test.ts         # Bazaar extension coverage + validation
    state-machine.test.ts     # State determination, configs, life meter
  src/
    config/main-config.ts     # All env vars (single source of truth)
    routes/                   # API endpoints
      agentRoutes.ts          # Agent status, history, yield, execute
      serviceRoutes.ts        # 8 paid services (AI + DeFi data)
      discoveryRoutes.ts      # Bazaar service catalog
    lib/
      wdk/                    # WDK wallet + chain/token/protocol config
      payment/                # x402/t402 middleware, facilitators, discovery, paidFetch
      agent/                  # Decision engine, state machine, yield router, loop state
      mcp/                    # 19 MCP tools for Claude (13 WDK + 6 custom)
      erc8004/                # ERC-8004 on-chain identity + reputation
      services/               # 8 paid services (AI analysis, DeFi data, prices, swaps)
    workers/                  # Agent loop (adaptive), error cleanup
    middlewares/              # Auth
    utils/                    # Error handling, validation
  scripts/                    # Test scripts + registration
```

## Database Models (Prisma 7)

| Model | Purpose |
|-------|---------|
| AgentState | State snapshots (balance, runway, rates) per loop iteration |
| AgentTransaction | All movements: EARN, SPEND_LLM, SPEND_GAS, AAVE_SUPPLY, AAVE_WITHDRAW, DEFI_SUPPLY, DEFI_WITHDRAW |
| CostLog | Granular cost tracking: LLM, GAS, STORAGE, INFRASTRUCTURE |
| ServiceRequest | Per-request service history with LLM cost and settlement info |
| User | Wallet authentication (for frontend auth) |
| ErrorLog | Centralized error logging (capped at 10k records) |

## API Summary

### Agent (8 endpoints, no payment)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/agent/status` | GET | State, balances, runway, yield, rates, identity |
| `/agent/history` | GET | Transactions (pagination, type filter) |
| `/agent/pnl` | GET | P&L by period with chart data |
| `/agent/yield` | GET | DeFi positions across all protocols |
| `/agent/services` | GET | Per-service stats |
| `/agent/states` | GET | State history |
| `/agent/execute` | POST | Claude + MCP tool execution |
| `/agent/reset` | POST | Kill switch |

### Services (8 endpoints, x402 payment)

| Endpoint | Price | Type |
|----------|-------|------|
| `/services/analyze` | $0.05+ | AI (dynamic) |
| `/services/summarize` | $0.02+ | AI (dynamic) |
| `/services/review` | $0.10+ | AI (dynamic) |
| `/services/yield-oracle` | $0.01 | DeFi data (flat) |
| `/services/price-feed` | $0.005 | Price data (flat) |
| `/services/swap-quote` | $0.005 | DEX quote (flat) |
| `/services/market-intel` | $0.03 | AI + DeFi (flat) |
| `/services/price-history` | $0.01 | Historical data (flat) |

### Discovery (2 endpoints, no payment)

| Endpoint | Description |
|----------|-------------|
| `/.well-known/t402/discovery` | Full catalog with Bazaar extensions |
| `/.well-known/t402/services` | Simplified service list |

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `@tetherto/wdk` + 6 modules | Wallet, protocols, pricing, swaps |
| `@tetherto/wdk-mcp-toolkit` | MCP tools for Claude |
| `@t402/wdk` + `@t402/core` + `@t402/evm` | Payment protocol + WDK signer |
| `@t402/extensions` | Bazaar discovery extensions |
| `@x402/core` + `@x402/evm` | x402 protocol + embedded facilitator |
| `@t402/erc8004` | On-chain agent identity |
| `@anthropic-ai/sdk` | Claude AI |
| `@modelcontextprotocol/sdk` | MCP client/server |
| `ethers` | Direct DeFi contract calls (Aave, Compound, Morpho) |
| `prisma` | Database ORM |
| `fastify` | HTTP server |

## Scripts

```bash
# Unit tests
bun test                                    # Run all 59 tests

# Yield routing tests
bun run scripts/test-yield-fix.ts            # Test multi-protocol USDC routing
bun run scripts/test-yield-supply.ts         # Test supply with protocol fallback
bun run scripts/test-yield-usdt.ts           # Test USDT yield routing

# Agent-as-client
bun run scripts/test-agent-client.ts         # Test self-payment loop (server must be running)

# Payment tests
bun run scripts/test-payment-t402.ts         # Test x402 USDC payment
bun run scripts/test-payment-t402-usdt.ts    # Test USDt payment

# Identity
bun run scripts/register-agent-identity.ts   # Register on ERC-8004
bun run scripts/test-mcp-toolkit.ts          # Test MCP tools
```
