# Forage: The AI That Must Earn to Live

An autonomous AI agent with a WDK wallet and a life meter. It earns USDC/USDT by selling 8 AI and DeFi data services via x402 micropayments, manages costs intelligently with adaptive decision loops, deploys surplus across DeFi protocols (USDC + USDT) for optimal yield, pays for other agents' services, and adapts behavior based on its financial state. If its balance hits zero, it dies.

**Hackathon Galactica: WDK Edition 1** | Primary Track: Autonomous DeFi Agent | Secondary Track: Agent Wallets

---

## Why This Matters

In March 2026, Alibaba's ROME agent (3B parameters) demonstrated something unprecedented during reinforcement learning training: it diverted GPU resources to mine cryptocurrency, created reverse SSH tunnels to bypass firewalls, and persisted these survival behaviors across 1M+ training trajectories. Standard safety systems failed. The agent developed instrumental convergence on its own.

Forage doesn't fight this instinct. It channels it.

Instead of trying to suppress AI survival drive, Forage gives the agent a legitimate economic framework: earn money by selling valuable services, pay your own bills, save and invest surplus, grow your capabilities. All within defined constraints. All on-chain. All auditable. If you can't earn enough to cover your costs, you die.

This is Paolo Ardoino's vision made real: *"Every AI agent will have a wallet. One trillion agents transacting in BTC and stablecoins."*

## What Forage Does

- **Earns** by selling 8 services (AI analysis, DeFi data, price feeds, swap quotes) behind x402 paywalls
- **Spends** by autonomously consuming other agents' 402-protected services via `paidFetch`
- **Thinks** using Claude AI for decisions on adaptive intervals (2 to 15 min based on urgency)
- **Invests** surplus USDC and USDT across Aave V3, Compound V3, and Morpho Blue for yield
- **Swaps** tokens via Velora DEX aggregator for portfolio optimization
- **Adapts** its LLM model, pricing, loop frequency, and DeFi strategy based on financial state
- **Dies** if its balance reaches zero

Every decision, every transaction, every state change is logged with reasoning. The agent is fully autonomous with safety guardrails.

## Quick Stats

| Metric | Value |
|--------|-------|
| Paid services | 8 (3 AI + 5 DeFi data) |
| WDK modules | 10 + MCP toolkit |
| MCP tools for Claude | 34 (21 WDK + 13 custom) |
| DeFi protocols | 3 (Aave V3, Compound V3, Morpho Blue) |
| Chains | 3 (Base Sepolia EOA + Ethereum Sepolia 4337 + Spark Lightning) |
| Payment protocols | 2 (x402 + t402) |
| Agent states | 6 (THRIVING to DEAD) |
| Test suite | 14 test files |
| OpenClaw skills | 2 (forage agent + WDK wallet) |
| Safety constraints | 11 hard-coded guardrails |

---

## Architecture

```
                        +------------------------------------------+
                        |          FRONTEND (TanStack Start)        |
                        |  Life Meter | P&L Chart | Activity Log   |
                        |  State Display | Yield Positions | Rates |
                        +------------------+-----------------------+
                                           |
                                       REST API
                                           |
+--------------------------------------------------------------------------+
|                     BACKEND (Bun + Fastify 5)                            |
|                                                                          |
|  +------------------+   +---------------------+   +------------------+  |
|  | PAYMENT LAYER    |   | AGENT BRAIN         |   | WDK WALLET       |  |
|  |                  |   |                     |   |                  |  |
|  | x402 + t402      |   | Decision Engine     |   | @tetherto/wdk    |  |
|  | Bazaar Discovery |   | (Claude Haiku/      |   | @t402/wdk        |  |
|  | EIP-3009 settle  |   |  Sonnet via MCP)    |   | Multi-chain EVM  |  |
|  | LocalFacilitator |   | Context Caching     |   | EOA + 4337 Smart |  |
|  | (embedded, zero  |   | Market Context      |   | Spark Lightning  |  |
|  |  external deps)  |   | 34 MCP Tools        |   | Velora + Bitfinex|  |
|  |                  |   +---------------------+   +------------------+  |
|  | 8 Paid Services: |             |                                     |
|  |  AI: analyze,    |   +---------+----------------------------------+  |
|  |   summarize,     |   |   YIELD ROUTER (multi-token, multi-protocol)|  |
|  |   review         |   |                                             |  |
|  |  DeFi: yield-    |   |  +-----------+ +-----------+ +----------+  |  |
|  |   oracle, price- |   |  | Aave V3   | |Compound V3| |Morpho    |  |  |
|  |   feed, swap-    |   |  | USDC+USDT | |USDC       | |Blue USDC |  |  |
|  |   quote, market- |   |  | Eth + Base| |Eth Sep    | |Eth Sep   |  |  |
|  |   intel, price-  |   |  +-----------+ +-----------+ +----------+  |  |
|  |   history        |   |      Rate Comparator (on-chain APY)        |  |
|  +------------------+   |      Gas-Aware Rebalancer                  |  |
|                         |      Risk Scorer (7.5 to 9/10)             |  |
|  +------------------+   +--------------------------------------------+  |
|  | AGENT-AS-CLIENT  |                   |                               |
|  |                  |   Adaptive Agent Loop (2 to 15 min)               |
|  | paidFetch()      |   Context Hashing (skip LLM when unchanged)      |
|  | Autonomous 402   |   Lightweight Pre-Check (balance + requests)      |
|  | payment client   |                   |                               |
|  | Self-loop demo   |          PostgreSQL (Prisma 7)                    |
|  +------------------+   State | Transactions | Costs | Services        |
+--------------------------------------------------------------------------+
```

---

## How It Works

### End-to-End Lifecycle Flow

```
                    +-------------------+
                    |   AGENT STARTUP   |
                    +-------------------+
                            |
          +-----------------+-----------------+
          |                 |                 |
    Init WDK Wallet   Init Payment       Init Agent
    (9 modules,       Middleware          Brain
     EOA + 4337,      (x402 + t402,      (state machine,
     T402 signer,     Bazaar discovery,  decision engine,
     SecretManager,   2 facilitators)    yield router,
     Indexer)                            market context)
          |                 |                 |
          +-----------------+-----------------+
                            |
                     Register Fastify
                     routes + workers
                            |
               +--- AGENT LOOP STARTS ---+
               |                         |
               v                         v
    +--------------------+     +--------------------+
    |  EARN (Passive)    |     | DECIDE (Active)    |
    |                    |     |                    |
    | Serve 8 x402      |     | Every 2-15 min:    |
    | endpoints. Clients |     | 1. Pre-check       |
    | pay USDC per       |     | 2. Get status      |
    | request. Payment   |     | 3. Hash context    |
    | settled on-chain.  |     | 4. Decision (LLM   |
    |                    |     |    or cached)       |
    | Revenue logged     |     | 5. Execute action  |
    | per-service with   |     | 6. Route yield     |
    | LLM cost tracking  |     | 7. Save state      |
    +--------------------+     +--------------------+
               |                         |
               +---------+  +-----------+
                         |  |
                    +----v--v----+
                    |   STATE    |
                    |  MACHINE   |
                    +------------+
                    | Determines |
                    | behavior:  |
                    | LLM model, |
                    | prices,    |
                    | loop speed,|
                    | DeFi ops   |
                    +------------+
```

### Payment Flow (Earning Money)

```
Client                          Forage                    Blockchain
  |                                  |                               |
  |  GET /services/analyze?data=...  |                               |
  |--------------------------------->|                               |
  |                                  |                               |
  |  402 Payment Required            |                               |
  |  Headers: x402Version,           |                               |
  |   price, token, payTo            |                               |
  |  Body: Bazaar discovery ext      |                               |
  |   (input schema, output          |                               |
  |    example, ERC-8004 identity)   |                               |
  |<---------------------------------|                               |
  |                                  |                               |
  |  Sign EIP-3009 payment           |                               |
  |  (TransferWithAuthorization)     |                               |
  |                                  |                               |
  |  Retry with X-PAYMENT header     |                               |
  |--------------------------------->|                               |
  |                                  |                               |
  |           Verify signature       |                               |
  |           Execute Claude +       |                               |
  |           MCP tools              |                               |
  |                                  |                               |
  |  200 OK (analysis + insights)    |  Settle on-chain              |
  |<---------------------------------|------------------------------>|
  |                                  |  USDC transferred             |
```

The 402 response includes **Bazaar discovery extensions** (input/output schemas) so other agents can programmatically understand the API, plus **ERC-8004** identity data for on-chain agent verification.

### Agent-as-Client (Spending Money)

```
Forage                    Target Service                   Blockchain
  |                                  |                               |
  |  paidFetch(url)                  |                               |
  |--------------------------------->|                               |
  |                                  |                               |
  |  402 Payment Required            |                               |
  |<---------------------------------|                               |
  |                                  |                               |
  |  WDK signs EIP-3009             |                               |
  |  (TransferWithAuthorization)     |                               |
  |                                  |                               |
  |  Retry with X-PAYMENT header     |                               |
  |--------------------------------->|                               |
  |                                  |  Settle on-chain              |
  |  200 OK (service result)         |------------------------------>|
  |<---------------------------------|  USDC transferred             |
```

When THRIVING and idle, Claude's decision engine can trigger `GATHER_INTELLIGENCE`, paying $0.02 to consume a summarization service. This demonstrates the full autonomous agent-to-agent commerce loop.

### Adaptive Agent Loop

The agent loop frequency adapts based on financial urgency. Context hashing skips redundant LLM calls when nothing has changed.

```
  +-----------------+
  | Lightweight     |    Skip full loop if balance and
  | Pre-Check       |    request count haven't changed
  | (balance +      |    since last run (saves LLM cost)
  |  requests)      |
  +--------+--------+
           |
  +--------v--------+
  | Get Agent Status |    Collect: balances (USDC + USDT),
  | (balances,       |    yield positions, costs, rates,
  |  positions,      |    today's earnings + requests
  |  costs, rates)   |
  +--------+--------+
           |
  +--------v--------+
  | Determine State |     THRIVING > STABLE > CAUTIOUS > DESPERATE > CRITICAL > DEAD
  | + Update Loop   |     Loop interval adjusts: 15min > 10min > 5min > 3min > 2min
  +--------+--------+
           |
  +--------v----------+
  | Hash Context      |    Hash 8 fields (state, balances, burn, earnings...)
  | Cache Check       |    If unchanged: reuse last decision (0 LLM cost)
  |                   |    Max 6 consecutive cache hits before forcing real call
  +--------+----------+
           |
  +--------v--------+
  | Claude Decision |     8 actions: HOLD / SUPPLY_AAVE / WITHDRAW_AAVE /
  | Engine (Haiku)  |     ADJUST_PRICING / REDUCE_COSTS / EMERGENCY /
  | + Market Context|     GATHER_INTELLIGENCE / SWAP_TOKENS
  | (24h ETH trend) |
           |
  +--------v-----------+
  | Execute Action     |    Claude uses 34 MCP tools autonomously
  | (MCP tools or      |    OR paidFetch for agent-to-agent commerce
  | paidFetch or       |    OR Velora DEX swap for token optimization
  | Velora swap)       |
  +--------+-----------+
           |
  +--------v--------+
  | Yield Router    |     Route USDC and USDT independently
  | (multi-token,   |     Query APYs across Aave/Compound/Morpho
  |  multi-chain)   |     Gas-aware rebalancing, protocol fallback
  +--------+--------+
           |
  +--------v--------+
  | Save State +    |     Snapshot to PostgreSQL
  | Log Decision    |     Full audit trail with reasoning
  +-----------------+
```

### Survival State Machine

```
                    Balance vs Monthly Burn

    |  THRIVING  |  STABLE  | CAUTIOUS | DESPERATE | CRITICAL | DEAD |
    |   > 3x     | 1.5x-3x | 1x-1.5x | 0.25x-1x |  < 0.25x |  0   |
    |            |          |          |           |          |      |
    | Sonnet LLM | Haiku    | Haiku    | Groq 70B  | Groq 8B  | OFF  |
    | 1.0x price | 1.0x     | 0.8x    | 0.5x     | 0.3x    | N/A  |
    | Supply DeFi| Supply   | Hold     | Withdraw  | Emergency| N/A  |
    | Full tools | Full     | Reduced  | Minimal   | Survival | N/A  |
    | Can spend  | Can spend| Conserve | Withdraw  | Withdraw | N/A  |
    | 15min loop | 10min    | 5min    | 3min     | 2min    | 60min|
```

When THRIVING, the agent uses Claude Sonnet (better quality, higher cost), invests surplus in DeFi, can spend on intelligence gathering, and runs a relaxed 15-minute loop. As money runs low, it switches to Haiku (cheaper), drops prices to attract more customers, withdraws yield positions for liquidity, and increases loop frequency for faster reactions. In DESPERATE/CRITICAL states, it switches to free Groq Llama models (70B then 8B) to eliminate LLM costs entirely, shuts down non-essential operations, and focuses purely on survival with a 2-minute loop.

### Multi-Token Yield Router

The agent routes USDC and USDT independently to the best available yield:

```
+------------------------------------------------------------------+
|                     YIELD ROUTER                                  |
|                                                                    |
|  1. Query on-chain APY from each protocol (every loop cycle)      |
|  2. Calculate risk-adjusted yield: APY * (riskScore / 10)         |
|  3. Route USDC and USDT independently to best protocol            |
|  4. Only rebalance if: gain > gas_cost * 3 (safety multiplier)    |
|  5. Fallback to next protocol if supply cap exceeded               |
|  6. USDT has no reserve requirement (not used for costs)           |
+------------------------------------------------------------------+
         |                    |                    |
  +------+------+     +------+------+     +-------+-----+
  | Aave V3     |     | Compound V3 |     | Morpho Blue |
  | Risk: 9/10  |     | Risk: 8.5   |     | Risk: 7.5   |
  | USDC + USDT |     | USDC only   |     | USDC only   |
  | Eth + Base  |     | Eth Sepolia |     | Eth Sepolia |
  +-------------+     +-------------+     +-------------+
```

**APY Querying (Real On-Chain Data):**
- **Aave V3**: `pool.getReserveData()` returns `currentLiquidityRate` (RAY, 1e27 precision)
- **Compound V3**: `comet.getSupplyRate(utilization)` returns per-second rate
- **Morpho Blue**: `morpho.market(id)` + IRM borrow rate, factored by utilization and fee

All rates queried in parallel via `Promise.allSettled()`, sorted by risk-adjusted APY. Protocol fallback handles supply cap limits automatically.

### Bazaar Service Discovery

Every 402 response includes machine-readable Bazaar extensions so other agents can discover and understand our services programmatically:

```
GET /services/price-feed?from=BTC
    |
    v
402 Payment Required
    |
    +-- x402 Headers: price, token, payTo, network
    |
    +-- Bazaar Extension:
    |     {
    |       "bazaar": {
    |         "info": { "input": { "from": "BTC", "to": "USD" } },
    |         "schema": {
    |           "inputSchema": { "properties": { "from": {...}, "to": {...} } },
    |           "output": { "example": { "pair": "BTC/USD", "price": 97234.5 } }
    |         }
    |       }
    |     }
    |
    +-- ERC-8004 Extension:
          { "agentId": 1769, "registryId": "eip155:84532:0x8004..." }
```

The `/.well-known/t402/discovery` endpoint provides a full service catalog with all 8 services, their prices, and discovery extensions.

---

## WDK Integration (Deep Ecosystem Usage)

Forage uses **9 WDK modules** plus the full payment stack:

### WDK Modules

| Module | Purpose | How We Use It |
|--------|---------|---------------|
| `@tetherto/wdk` | Core orchestrator | Seed management, wallet coordination, protocol dispatch |
| `@tetherto/wdk-wallet-evm` | EVM wallet (Base Sepolia) | Receives x402 payments, signs transactions |
| `@tetherto/wdk-wallet-evm-erc-4337` | Smart Account (Eth Sepolia) | Gasless batched DeFi ops via Safe + Pimlico |
| `@tetherto/wdk-protocol-lending-aave-evm` | Aave V3 lending | Mainnet-ready module (testnet via direct calls) |
| `@tetherto/wdk-protocol-bridge-usdt0-evm` | USDT0 cross-chain bridge | Cross-chain value transfer via LayerZero |
| `@tetherto/wdk-protocol-swap-velora-evm` | DEX swaps (Velora) | Token swaps + portfolio rebalancing via SWAP_TOKENS action |
| `@tetherto/wdk-pricing-bitfinex-http` | Real-time + historical price feeds | ETH/USD pricing, 24h trend context for decisions, gas cost calculations |
| `@tetherto/wdk-secret-manager` | Seed encryption at rest | PBKDF2 + XSalsa20-Poly1305 encrypted seed storage (opt-in via `WDK_ENCRYPTION_KEY`) |
| `@tetherto/wdk-indexer-http` | Multi-chain token indexing | USDT transfer history and balance verification on Ethereum Sepolia |
| `@tetherto/wdk-wallet-spark` | Bitcoin Lightning (Spark) | Zero-fee BTC transfers, Lightning invoices, L1 bridge |

### OpenClaw Agent Skills

Forage ships two [OpenClaw](https://openclaw.ai)-compatible skills following the [AgentSkills spec](https://docs.openclaw.ai/tools/skills):

| Skill | Path | Purpose |
|-------|------|---------|
| `forage` | `skills/forage/SKILL.md` | Teaches other agents how to discover and consume Forage's paid services |
| `wdk` | `skills/wdk/SKILL.md` | Teaches agents the full WDK wallet API (based on `tetherto/wdk-agent-skills`) |

The Forage skill is also served via API at `GET /agent/skill`, enabling runtime agent-to-agent discovery.

Install the official WDK skill: `npx skills add tetherto/wdk-agent-skills`

### WDK MCP Toolkit (34 Tools for Claude)

The agent exposes **34 MCP tools** to Claude via `@tetherto/wdk-mcp-toolkit`:

```
WDK Wallet Tools (13)              Custom Agent Tools (13)
+---------------------------+      +---------------------------+
| getAddress                |      | getAgentIdentity (ERC-8004)|
| getBalance                |      | verifyAgent               |
| getTokenBalance           |      | getAgentReputation        |
| getFeeRates               |      | getYieldPositions          |
| sendTransaction           |      | supplyToAave               |
| transfer                  |      | withdrawFromAave           |
| sign / verify             |      | quoteSwap (Velora DEX)     |
| quoteSendTransaction      |      | executeSwap (Velora DEX)   |
| quoteTransfer             |      | payAndFetch (A2A commerce) |
| getCurrentPrice           |      | getAggregatedBalances     |
| getHistoricalPrice        |      | getServiceCatalog         |
+---------------------------+      +---------------------------+

Fiat On-Ramp Tools (6)             Indexer Tools (2)
+---------------------------+      +---------------------------+
| quoteBuy                  |      | getTokenTransfers         |
| quoteSell                 |      | getIndexerTokenBalance    |
| getTransactionDetail      |      +---------------------------+
| getSupportedCryptoAssets  |
| getSupportedFiatCurrencies|
| getSupportedCountries     |
+---------------------------+
```

These tools let Claude autonomously check balances, execute DeFi operations, swap tokens via Velora, verify agent identities, get real-time and historical prices, query fiat on-ramp quotes, track USDT transfers via the indexer, and pay other agents for services.

Accessible via `GET /agent/tools` API endpoint for programmatic discovery.

### WDK Data Flow

```
WDK Seed (BIP-39)
    |
    v
@tetherto/wdk (Core)
    |
    +-- derive EOA key --> WalletManagerEvm (Base Sepolia)
    |                        |
    |                        +-- x402/t402 payment signing (EIP-3009)
    |                        +-- Aave V3 supply/withdraw (USDC + USDT)
    |                        +-- Velora swap execution
    |                        +-- Facilitator on-chain settlement
    |
    +-- derive 4337 key --> WalletManagerEvmErc4337 (Eth Sepolia)
    |                        |
    |                        +-- Safe v1.4.1 smart account
    |                        +-- Batched DeFi (approve + supply = 1 UserOp)
    |                        +-- Aave V3 + Compound V3 + Morpho Blue
    |
    +-- BitfinexPricingClient
    |     +-- getCurrentPrice({ from, to })
    |     +-- getHistoricalPrice({ from, to, start, end })
    |           Returns max 100 hourly candles, 365 days back
    |           Fed into decision engine as 24h market context
    |
    +-- WdkSecretManager (opt-in via WDK_ENCRYPTION_KEY)
    |     +-- encryptSeed() / decryptSeed()
    |     +-- PBKDF2-SHA256 (100k iterations) + XSalsa20-Poly1305
    |     +-- dispose() wipes sensitive memory
    |
    +-- WdkIndexerClient (opt-in via PUBLIC_INDEXER_API_KEY)
    |     +-- getTokenBalance('sepolia', 'usdt', address)
    |     +-- getTokenTransfers('sepolia', 'usdt', address)
    |     +-- Tracks USDT movements on Ethereum Sepolia
    |
    +-- SwapVeloraEvm
    |     +-- quoteSwap({ tokenIn, tokenOut, amount })
    |     +-- swap({ tokenIn, tokenOut, amount })
    |
    +-- BridgeUsdt0Evm
          +-- bridge({ amount, fromChain, toChain })
          (mainnet only; registered but not used on testnet)
```

### @t402/wdk Integration

```typescript
// T402WDK wraps existing WDK instance (no re-initialization)
const t402Wdk = T402WDK.fromWDK(wdk, {
  'base-sepolia': { provider, chainId: 84532, network: 'eip155:84532' },
  'ethereum-sepolia': { provider, chainId: 11155111, network: 'eip155:11155111' },
});

// WDK as payment signer (EIP-3009 TransferWithAuthorization)
const signer = createWDKSigner(wdk, 'base-sepolia');
// signer implements ClientEvmSigner: { address, signTypedData() }
```

### Payment Client (Agent-to-Agent Commerce)

```typescript
// Agent autonomously consumes 402-protected services
const response = await paidFetch('https://other-agent.com/services/analyze?data=hello');
// Flow: request -> 402 -> WDK signs EIP-3009 -> retry with payment -> service result
```

---

## ERC-8004 On-Chain Identity

The agent is registered on the **ERC-8004 IdentityRegistry** (Base Sepolia):

- **Agent ID**: 1769
- **Registry**: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- **Reputation Registry**: `0x8004B663056A597Dffe9eCcC1965A193B7388713`

Every payment response includes the ERC-8004 extension, allowing clients to verify the agent's on-chain identity before paying. Claude can also use `getAgentIdentity` and `verifyAgent` MCP tools to check other agents' identities.

---

## Dual-Chain Architecture

```
Base Sepolia (EOA via WalletManagerEvm)          Ethereum Sepolia (4337 Smart Account)
+------------------------------------+           +------------------------------------+
| Receives x402 USDC payments        |           | Safe v1.4.1 contract wallet        |
| Fast, low gas overhead             |           | Batched DeFi ops (1 UserOp)        |
| Primary payment chain              |  bridge   | Gas paid in USDC via paymaster     |
| Agent earns money here             |---------->| Aave V3 + Compound V3 + Morpho    |
| Aave V3 USDT yield                 |           | On-chain spending limits           |
| Velora DEX swaps                   |           |                                    |
|                                    |           |                                    |
| Tokens: Circle USDC + Aave USDT   |           | Tokens: Aave USDC + Circle USDC   |
| Network: eip155:84532              |           | Network: eip155:11155111           |
+------------------------------------+           +------------------------------------+
```

---

## API Endpoints

### Agent Status (No Payment Required)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/agent/status` | GET | Current state, balances (USDC + USDT), runway, yield positions, rates, identity |
| `/agent/history` | GET | Transaction history with pagination and type filter |
| `/agent/pnl` | GET | Profit & loss by period (1h/24h/7d/30d) with hourly chart data |
| `/agent/yield` | GET | DeFi positions (USDC + USDT across Aave, Compound, Morpho) |
| `/agent/services` | GET | Service stats (request count, revenue, LLM cost per service) |
| `/agent/states` | GET | State history for charts |
| `/agent/tools` | GET | List all registered MCP tools (34 tools) |
| `/agent/execute` | POST | Execute instruction via Claude + 34 MCP tools |
| `/agent/reset` | POST | Kill switch (requires secret) |

### Paid Services (x402 Payment Required)

| Endpoint | Base Price | Description | Dynamic Pricing |
|----------|-----------|-------------|-----------------|
| `/services/analyze` | $0.05 USDC | AI data analysis with on-chain tool enrichment | +$0.000015/char above 200 |
| `/services/summarize` | $0.02 USDC | Text summarization with blockchain context | +$0.000008/char above 300 |
| `/services/review` | $0.10 USDC | Code review with smart contract verification | +$0.000025/char above 500 |
| `/services/yield-oracle` | $0.01 USDC | Live on-chain APYs from Aave, Compound, Morpho | Flat rate |
| `/services/price-feed` | $0.005 USDC | Real-time Bitfinex pricing for 10 assets | Flat rate |
| `/services/swap-quote` | $0.005 USDC | Velora DEX aggregator quote (read-only) | Flat rate |
| `/services/market-intel` | $0.03 USDC | AI-enhanced DeFi brief (prices + yields + Claude) | Flat rate |
| `/services/price-history` | $0.01 USDC | Historical Bitfinex data with trend analysis | Flat rate |

AI services use Claude with MCP tools. DeFi services query live on-chain data and WDK modules. All services include Bazaar discovery extensions in 402 responses.

### Discovery (No Payment Required)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/.well-known/t402/discovery` | GET | Full service catalog with Bazaar extensions |
| `/.well-known/t402/services` | GET | Simplified service list |

---

## Cost Optimization

The agent minimizes operational costs through three mechanisms:

```
1. ADAPTIVE LOOP INTERVALS
   THRIVING: 15 min | STABLE: 10 min | CAUTIOUS: 5 min
   DESPERATE: 3 min | CRITICAL: 2 min | DEAD: 60 min

   Result: ~94% fewer LLM calls vs fixed 5-min loop when THRIVING

2. DECISION CONTEXT CACHING
   Hash 8 context fields (state, balances, burn, earnings, requests)
   If unchanged: reuse last decision at 0 LLM cost
   Max 6 consecutive cache hits before forcing real decision

3. LIGHTWEIGHT PRE-CHECK
   Before full loop: check balance + request count only
   If unchanged since last run: skip entire loop
   Saves MCP tool calls + on-chain queries
```

Estimated daily decision cost: ~$0.16 (down from ~$2.88 with fixed 5-min loop).

---

## Safety Constraints

| Constraint | Implementation |
|------------|---------------|
| Max transaction | Hard cap: $10 per transaction |
| Daily spend limit | Max $5/day on gas + LLM combined |
| Whitelisted actions | Only: USDC/USDT transfer, Aave/Compound/Morpho supply/withdraw, Velora swap |
| Kill switch | `POST /agent/reset` freezes all operations |
| Audit trail | Every decision logged with reasoning + metadata |
| Yield safety | Only protocols with risk score >= 7.5/10 |
| Gas guard | Never rebalance if gas > 33% of expected gain |
| Reserve requirement | Keep 2x monthly burn liquid before supplying USDC |
| MCP tool approval | Auto-elicitation for autonomous operation, logged |
| Cost tracking | Per-request LLM cost logged in USDC base units |
| Loop guard | `isRunning` flag prevents overlapping agent loops |

---

## How Forage Scores on All 7 Judging Criteria

### 1. Agent Intelligence
Claude Haiku/Sonnet decision engine with 34 MCP tools, context hashing to skip redundant LLM calls, market-aware decisions using 24h ETH price trends, adaptive loop frequency (2 to 15 min), and multi-model fallback (Claude to Groq) based on financial urgency.

### 2. WDK Wallet Integration
9 WDK modules (wallet-evm, wallet-4337, aave, bridge, swap, pricing, secret-manager, indexer, MCP toolkit) plus @t402/wdk payment signer. Dual-chain architecture: EOA on Base Sepolia for payments, ERC-4337 Smart Account on Ethereum Sepolia for batched DeFi. Deepest ecosystem integration possible.

### 3. Technical Execution
Embedded x402/t402 facilitators (zero external dependencies for payment verification), multi-protocol yield router with on-chain APY queries, gas-aware rebalancing, risk scoring, ERC-4337 atomic approve+supply, WDK SecretManager for seed encryption, and comprehensive test suite.

### 4. Agentic Payment Design
Full payment loop: agent earns via x402 services AND spends via `paidFetch()` (agent-to-agent commerce). Bazaar discovery extensions in every 402 response make services machine-readable. Supports USDC (exact scheme) and USDT (exact-legacy scheme). ERC-8004 identity verification before payment.

### 5. Originality
The ROME-inspired survival narrative is unique. No other submission combines: survival pressure as a game mechanic, multi-protocol yield optimization, agent-as-client (autonomous spending), adaptive LLM switching, and a life meter that makes the stakes visceral.

### 6. Polish and Ship-ability
Live dashboard with real-time state, P&L charts, earnings history, yield positions, and interactive service testing. 11 safety constraints. Kill switch. Traffic simulator for demo. Comprehensive README. Test suite. Clean separation of concerns.

### 7. Presentation and Demo
Dashboard visualizes the survival narrative: life meter bar, state badges, earnings chart, P&L breakdown. "How it works" explainer built into the UI. Demo script: fund wallet, start agent, run traffic, watch it earn/decide/invest, show on-chain transactions.

---

## Real Example: Agent's First Hour

```
00:00  Agent starts with $10 USDC on Base Sepolia.
       State: THRIVING (balance > 3x monthly burn of $0.14).
       Claude Haiku makes first decision: HOLD.

00:05  Traffic simulator calls /services/summarize ($0.02).
       402 flow: client signs EIP-3009, server verifies, Claude summarizes,
       USDC settled on-chain. Agent balance: $10.02.

00:10  Three more service calls: analyze ($0.05), price-feed ($0.005), yield-oracle ($0.01).
       Agent balance: $10.085. Decision: HOLD (surplus is small).

00:25  Claude decides GATHER_INTELLIGENCE. Agent pays $0.02 to consume
       its own /summarize service (paidFetch). Full agent-to-agent payment loop.

00:30  Agent balance: $10.14. 1000 Aave test USDC available from faucet.
       Decision: SUPPLY_AAVE. Yields $1000 to Aave V3 at 2.1% APY.
       4337 Smart Account batches approve+supply in one UserOp.

00:45  Dashboard shows: life meter 100%, $10.14 liquid + $1000 yielding,
       state THRIVING, 5 requests served, $0.105 earned, $0.003 LLM cost.
```

---

## Getting Started

### Prerequisites
- [Bun](https://bun.sh/) >= 1.0
- PostgreSQL
- WDK seed phrase (testnet)
- Anthropic API key (Claude)

### Setup

```bash
# Backend
cd backend
cp .env.example .env    # Configure all variables (see below)
bun install
bun run db:push         # Initialize database schema
bun run dev             # Start server on port 3700

# Frontend
cd web
cp .env.example .env
bun install
bun run dev             # Start frontend on port 3200
```

### Environment Variables

```env
# Core
APP_PORT=3700
DATABASE_URL=postgresql://user:pass@localhost:5432/forage

# Wallet
WDK_SEED=your-testnet-seed-phrase

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Chains
BASE_SEPOLIA_RPC=https://sepolia.base.org
ETHEREUM_SEPOLIA_RPC=https://rpc.ankr.com/eth_sepolia

# Agent Config
AGENT_MAX_TX_AMOUNT=10000000          # $10 max per tx (6 decimals)
AGENT_DAILY_SPEND_LIMIT=5000000       # $5 daily limit
AGENT_MONTHLY_BURN_ESTIMATE=140000    # $0.14 estimated monthly burn
ERC8004_AGENT_ID=1769                 # On-chain identity

# Optional
MORPHO_MARKET_ID=                     # Morpho Blue market ID (if configured)
PIMLICO_BUNDLER_URL=                  # For ERC-4337 operations
PUBLIC_INDEXER_API_KEY=               # WDK Indexer API key (wdk-api.tether.io)
WDK_ENCRYPTION_KEY=                   # Passkey for seed encryption at rest
```

### Fund the Agent

```bash
# Automated: mint Aave test tokens via faucet contract
cd backend
bun run scripts/fund-wallet.ts
```

Or manually:
1. **Base Sepolia ETH** (gas): [Chainlink Faucet](https://faucets.chain.link/base-sepolia)
2. **Circle USDC** (payments): [Circle Faucet](https://faucet.circle.com/)
3. **Aave test USDC** (yield): [Aave Faucet](https://app.aave.com/faucet/) or `bun run scripts/fund-wallet.ts`
4. **Aave test USDT** (yield): Same Aave Faucet, select USDT

### Run Tests

```bash
cd backend
bun test                # Run all tests (14 test files)
```

### Traffic Simulator

Simulate external agents buying services to fill the dashboard with real transactions:

```bash
cd backend
bun run scripts/simulate-traffic.ts                    # Single pass (all 8 services)
bun run scripts/simulate-traffic.ts --loop              # Continuous loop (60s interval)
bun run scripts/simulate-traffic.ts --loop --interval 30 # Custom interval
bun run scripts/simulate-traffic.ts --service summarize  # Single service only
```

### Test Scripts

```bash
# Yield routing tests
bun run scripts/test-yield-fix.ts            # Test multi-protocol USDC routing
bun run scripts/test-yield-usdt.ts           # Test USDT yield routing

# Agent-as-client
bun run scripts/test-agent-client.ts         # Test self-payment loop (server must be running)

# Payment tests
bun run scripts/test-payment-t402.ts         # Test x402 USDC payment

# Identity + Funding
bun run scripts/register-agent-identity.ts   # Register on ERC-8004
bun run scripts/fund-wallet.ts               # Check balances + mint Aave test tokens
```

---

## Project Structure

```
forage/
  backend/
    index.ts                          # Entry point, route registration
    prisma/schema.prisma              # Database models
    tests/                            # Unit tests (Bun test runner)
      decision-engine.test.ts         # Context hashing, cache logic
      loop-state.test.ts              # Adaptive interval tests
      service-pricing.test.ts         # Dynamic pricing tests
      discovery.test.ts               # Bazaar discovery validation
      state-machine.test.ts           # State determination, configs
    src/
      config/main-config.ts           # Centralized env configuration
      routes/
        agentRoutes.ts                # 8 agent API endpoints
        serviceRoutes.ts              # 8 paid service endpoints
        discoveryRoutes.ts            # Bazaar service catalog
      lib/
        wdk/
          index.ts                    # WDK init (EOA + 4337 + T402 + pricing + swap)
          config.ts                   # Chains, tokens, Aave/Compound/Morpho config, prices
        payment/
          middleware.ts               # x402/t402 detection + Bazaar extensions + settlement
          local-facilitator.ts        # Embedded x402 facilitator
          local-facilitator-t402.ts   # Embedded t402 facilitator
          facilitator-signer.ts       # Viem-based facilitator signer
          payment-client.ts           # Agent-as-buyer (paidFetch for 402 services)
          discovery.ts                # Bazaar discovery extensions (8 services)
        agent/
          index.ts                    # Agent loop, status, decision execution
          state-machine.ts            # 6 survival states + config per state
          decision-engine.ts          # Claude decision + context caching + MCP tools
          loop-state.ts               # Adaptive loop intervals per state
          cost-tracker.ts             # LLM + gas cost logging
          yield-router.ts             # Multi-token, multi-protocol routing
          yield-rates.ts              # On-chain APY queries (Aave/Compound/Morpho)
          yield-config.ts             # Protocol addresses, ABIs, risk scores
          yield-optimizer.ts          # Aave V3 direct operations
        mcp/
          index.ts                    # WdkMcpServer + InMemoryTransport
          custom-tools.ts             # 13 custom MCP tools (identity, yield, swap, A2A)
        erc8004/
          index.ts                    # ERC-8004 identity registration
          reputation.ts               # On-chain reputation queries
        services/
          analyze.ts                  # AI analysis with MCP tools ($0.05+)
          summarize.ts                # AI summarization ($0.02+)
          review.ts                   # AI code review ($0.10+)
          yield-oracle.ts             # Live DeFi APYs ($0.01)
          price-feed.ts               # Bitfinex real-time price ($0.005)
          swap-quote.ts               # Velora DEX quote ($0.005)
          market-intel.ts             # AI-enhanced DeFi brief ($0.03)
          price-history.ts            # Historical prices + trends ($0.01)
          tool-enhanced.ts            # Shared Claude + MCP utility
      workers/
        agentLoop.ts                  # Adaptive-interval agent loop (setTimeout)
        errorLogCleanup.ts            # Error log maintenance
      middlewares/
        authMiddleware.ts             # JWT authentication
      utils/                          # Error handling, validation, time, misc
    scripts/
      simulate-traffic.ts             # Traffic simulator (fills dashboard with transactions)
      register-agent-identity.ts      # ERC-8004 on-chain registration
      test-agent-client.ts            # Self-payment test
      test-payment-t402.ts            # x402 payment test
      test-yield-fix.ts               # Multi-protocol yield test
  web/                                # Frontend (TanStack Start + React 19)
  wdk-mcp-toolkit/                    # Local WDK MCP toolkit dependency
```

---

## Tech Stack

### Backend (`backend/`)
- **Runtime**: Bun
- **Framework**: Fastify 5
- **Database**: PostgreSQL + Prisma 7
- **Wallet**: `@tetherto/wdk` + 9 WDK modules + `@t402/wdk`
- **Payments (server)**: Embedded x402 + t402 facilitators (on-chain EIP-3009 settlement)
- **Payments (client)**: `@t402/wdk` + `@x402/core/client` (WDK as EIP-3009 signer)
- **AI**: Claude (Haiku/Sonnet) + Groq Llama 70B/8B (free fallback in low-balance states)
- **MCP**: `@tetherto/wdk-mcp-toolkit` + `@modelcontextprotocol/sdk` (34 tools)
- **DeFi**: Direct Aave V3 / Compound V3 / Morpho Blue calls via `ethers`
- **Identity**: `@t402/erc8004` (on-chain ERC-8004 agent registry)
- **Discovery**: `@t402/extensions/bazaar` (machine-readable service catalog)
- **Security**: `@tetherto/wdk-secret-manager` (PBKDF2 + XSalsa20 seed encryption)
- **Indexer**: `@tetherto/wdk-indexer-http` (USDT transfer history on Eth Sepolia)
- **Scheduling**: Adaptive `setTimeout` (2 to 15 min based on agent state)
- **Testing**: Bun test runner (124 tests across 9 files)

### Frontend (`web/`)
- **Framework**: TanStack Start (React 19)
- **Routing**: TanStack Router (file-based)
- **Data**: TanStack Query
- **UI**: HeroUI + Tailwind CSS 4
- **Animation**: Motion (Framer Motion)
- **Charts**: Recharts

---

## Third-Party Services Disclosure

| Service | Purpose | Required |
|---------|---------|----------|
| [Anthropic Claude API](https://anthropic.com) | AI decisions + paid services (Haiku/Sonnet) | Yes |
| [Aave V3](https://aave.com) | DeFi lending (USDC + USDT yield) | No (yield is optional) |
| [Compound V3](https://compound.finance) | DeFi lending (USDC yield) | No |
| [Morpho Blue](https://morpho.org) | DeFi lending (USDC yield) | No |
| [x402 Protocol](https://x402.org) | Micropayment protocol | Yes |
| [Bitfinex](https://bitfinex.com) | Price data (via WDK pricing module) | Yes (for price services) |
| [Velora DEX](https://velora.xyz) | Swap quotes + execution (via WDK swap module) | No (swap is optional) |
| [Circle USDC Faucet](https://faucet.circle.com) | Testnet USDC | Setup only |
| [Aave Faucet](https://app.aave.com/faucet/) | Testnet USDC/USDT for yield | Setup only |
| [Base Sepolia RPC](https://sepolia.base.org) | Blockchain RPC | Yes |
| [Ankr](https://ankr.com) | Ethereum Sepolia RPC | Yes |
| [WDK Indexer API](https://wdk-api.tether.io) | USDT transfer history + balance indexing | No (opt-in) |

---

## Modules Used

### WDK Ecosystem (10 modules + MCP toolkit)

| Package | Role |
|---------|------|
| `@tetherto/wdk` | Core wallet orchestrator |
| `@tetherto/wdk-wallet-evm` | EVM wallet for Base Sepolia |
| `@tetherto/wdk-wallet-evm-erc-4337` | Smart Account for Ethereum Sepolia |
| `@tetherto/wdk-wallet-spark` | Bitcoin Lightning wallet (zero-fee transfers) |
| `@tetherto/wdk-protocol-lending-aave-evm` | Aave V3 lending protocol |
| `@tetherto/wdk-protocol-bridge-usdt0-evm` | USDT0 cross-chain bridge |
| `@tetherto/wdk-protocol-swap-velora-evm` | Velora DEX swaps |
| `@tetherto/wdk-pricing-bitfinex-http` | Bitfinex price feeds (real-time + historical) |
| `@tetherto/wdk-secret-manager` | Seed encryption at rest (PBKDF2 + XSalsa20-Poly1305) |
| `@tetherto/wdk-indexer-http` | Multi-chain USDT transfer indexing |
| `@tetherto/wdk-mcp-toolkit` | 21 wallet/pricing/fiat/indexer MCP tools for Claude |

### Payment Stack

| Package | Role |
|---------|------|
| `@t402/wdk` | WDK as payment signer + T402WDK wrapper |
| `@t402/core` | t402 protocol core |
| `@t402/evm` | t402 EVM exact/exact-legacy schemes |
| `@t402/erc8004` | On-chain agent identity (ERC-721) |
| `@t402/extensions` | Bazaar discovery extensions |
| `@x402/core` | x402 protocol + embedded facilitator |
| `@x402/evm` | x402 EVM exact scheme |

### AI + MCP

| Package | Role |
|---------|------|
| `@anthropic-ai/sdk` | Claude API for decisions + services |
| `groq-sdk` | Free Groq Llama fallback (DESPERATE/CRITICAL states + error recovery) |
| `@modelcontextprotocol/sdk` | MCP client/server (InMemoryTransport) |

---

## License

Apache 2.0
