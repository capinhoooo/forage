---
name: forage
description: Autonomous AI agent that earns USDC/USDT via x402 micropayments, invests in DeFi for yield, and dies if its balance hits zero.
---

# Forage Agent Skill

Forage is an autonomous economic AI agent built on Tether WDK. It sells 8 services via x402/t402 micropayments, manages multi-protocol DeFi yield, and adapts its behavior based on financial state.

## Architecture

### State Machine
The agent operates on a lifecycle: `THRIVING > STABLE > CAUTIOUS > DESPERATE > CRITICAL > DEAD`.
Each state adjusts LLM model (Claude Haiku / Groq Llama), pricing multiplier, loop interval, and DeFi strategy.

### Earning
8 paid services behind x402 payment middleware:
- **AI services**: `analyze` ($0.05), `summarize` ($0.02), `review` ($0.10)
- **DeFi data**: `yield-oracle` ($0.01), `price-feed` ($0.005), `swap-quote` ($0.008), `market-intel` ($0.03), `price-history` ($0.01)

Payment accepts USDC on Base Sepolia and USDT on Ethereum Sepolia.

### Yield Management
Surplus funds deploy across:
- **Aave V3** on Base Sepolia (primary)
- **Compound V3** on Base Sepolia
- **Morpho Blue** on Base Sepolia

Uses ERC-4337 Smart Account for atomic approve+supply batching.

### Decision Engine
Claude AI evaluates financial state every 5 minutes and picks one action:
`HOLD`, `SUPPLY_AAVE`, `WITHDRAW_AAVE`, `ADJUST_PRICING`, `REDUCE_COSTS`, `EMERGENCY`, `GATHER_INTELLIGENCE`, `SWAP_TOKENS`

### Payment Protocols
- **x402**: Standard HTTP 402 micropayments with USDC
- **t402**: Extended payment protocol with USDT support
- **Bazaar discovery**: Agent service catalog at `/.well-known/t402/discovery`

### WDK Integration
Uses 10 WDK modules: wallet-evm, wallet-evm-erc-4337, wallet-spark (Bitcoin Lightning), protocol-lending-aave-evm, protocol-bridge-usdt0-evm, protocol-swap-velora-evm, pricing-bitfinex-http, secret-manager, indexer-http, and MCP toolkit (34+ tools).

Lending operations route through WDK MCP lending module first, falling back to direct ethers.js if unavailable.

## API Endpoints

### Agent (no payment required)
- `GET /agent/status` - Full agent state, balances, yield positions, WDK modules
- `GET /agent/history` - Recent transactions
- `GET /agent/pnl?period=24h` - Revenue/cost breakdown
- `GET /agent/decisions?limit=10` - AI decision history with reasoning
- `GET /agent/states?limit=50` - State history snapshots
- `GET /agent/services` - Service catalog with pricing
- `GET /agent/spark` - Spark Lightning wallet info
- `GET /agent/tools` - MCP tool list
- `GET /agent/skill` - OpenClaw agent skill (SKILL.md)

### Paid Services (x402 payment required)
- `GET /services/analyze?input=<data>` - AI data analysis
- `GET /services/summarize?input=<text>` - AI summarization
- `GET /services/review?input=<code>&language=typescript` - AI code review
- `GET /services/yield-oracle` - Live DeFi APYs
- `GET /services/price-feed?from=BTC&to=USD` - Real-time pricing
- `GET /services/swap-quote?tokenIn=USDC&tokenOut=ETH&amount=10` - DEX quotes
- `GET /services/market-intel?tokens=BTC,ETH` - AI market brief
- `GET /services/price-history?from=ETH&days=7` - Historical prices

### Discovery
- `GET /.well-known/t402/discovery` - Full agent catalog (Bazaar)
- `GET /.well-known/t402/services` - Simplified service list

## Tech Stack
- **Runtime**: Bun
- **Server**: Fastify 5
- **Database**: PostgreSQL + Prisma 7
- **Wallet**: Tether WDK (EOA + ERC-4337)
- **AI**: Claude Haiku (primary) + Groq Llama (fallback)
- **Frontend**: TanStack Start + React 19 + HeroUI
- **Chains**: Base Sepolia (EOA), Ethereum Sepolia (4337), Spark (Lightning)

## OpenClaw Integration

This agent exposes its skill at `GET /agent/skill` for other OpenClaw agents to discover and learn how to interact with Forage's paid services. Install the WDK skill for wallet operations: `npx skills add tetherto/wdk-agent-skills`.
