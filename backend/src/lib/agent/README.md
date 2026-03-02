# Agent Brain

Core intelligence layer: adaptive decision engine, survival state machine, cost tracking, and multi-protocol yield routing.

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Agent loop orchestration, status aggregation, decision-to-execution wiring |
| `state-machine.ts` | 6 survival states with thresholds, LLM/pricing/yield configs |
| `decision-engine.ts` | Claude AI decisions + context caching + MCP tool execution |
| `loop-state.ts` | Adaptive loop intervals per agent state (2 to 15 min) |
| `cost-tracker.ts` | LLM + gas cost logging, monthly burn estimation |
| `yield-optimizer.ts` | Direct Aave V3 operations (supply, withdraw, positions) |
| `yield-router.ts` | Multi-protocol yield routing with gas-aware rebalancing |
| `yield-rates.ts` | On-chain APY queries for Aave, Compound, Morpho |
| `yield-config.ts` | Protocol addresses, ABIs, risk scores, constants |

## Agent Loop Flow

```
Lightweight Pre-Check
  |  (skip if balance + requests unchanged)
  v
getAgentStatus()          Collect: balances (USDC + USDT), positions,
  |                       costs, rates, today's earnings + requests
  v
determineState()          Calculate state from balance vs monthly burn
  + updateLoop()          Adjust loop interval (15min to 2min)
  |
  v
hashContext()             Hash 8 fields: state, balances, burn, earnings...
  |
  +-- Hash unchanged?    Reuse last decision (0 LLM cost)
  |   (max 6 skips)      consecutiveCacheHits++
  |
  +-- Hash changed?      makeDecision() via Claude Haiku
  |                       Parse JSON action from LLM response
  v
executeDecisionAction()   Map action to MCP tool instruction
  |                       Claude executes autonomously with 19 tools
  v
routeYield()              Compare APYs across Aave/Compound/Morpho
  |                       Route USDC and USDT independently
  |                       Gas-aware rebalancing with protocol fallback
  v
saveAgentState()          Snapshot to PostgreSQL with full audit trail
```

## Adaptive Loop Intervals

The loop frequency adapts to financial urgency via `loop-state.ts`:

| State | Interval | Reasoning |
|-------|----------|-----------|
| THRIVING | 15 min | Relaxed, surplus funds, nothing urgent |
| STABLE | 10 min | Healthy, moderate monitoring |
| CAUTIOUS | 5 min | Watch closely, money getting tight |
| DESPERATE | 3 min | Need fast reactions to earn/save |
| CRITICAL | 2 min | Emergency pace, survival mode |
| DEAD | 60 min | Just check if revived somehow |

Implemented with `setTimeout` (not `node-cron`) so the interval can change dynamically between iterations.

## State Machine

| State | Runway | LLM | Price | Yield Action | Loop |
|-------|--------|-----|-------|-------------|------|
| THRIVING | > 3x monthly | Sonnet | 1.0x | Supply to best protocol | 15 min |
| STABLE | 1.5x to 3x | Haiku | 1.0x | Supply to best protocol | 10 min |
| CAUTIOUS | 1x to 1.5x | Haiku | 0.8x | Hold current positions | 5 min |
| DESPERATE | 0.25x to 1x | Haiku | 0.5x | Withdraw all positions | 3 min |
| CRITICAL | < 0.25x | Haiku | 0.3x | Emergency withdrawal | 2 min |
| DEAD | 0 | OFF | N/A | Agent shutdown | 60 min |

## Decision Engine

### Context Caching

Before calling Claude, the engine hashes 8 context fields:

```
state | balanceUsdc*100 | balanceUsdt*100 | monthlyBurn*100 |
aaveSupplied*100 | todayEarnings*1000 | todayCosts*1000 | requestsToday
```

Rounding prevents micro-fluctuations from triggering unnecessary LLM calls. Max 6 consecutive cache hits before forcing a real decision.

### 8 Decision Actions

| Action | When | Execution |
|--------|------|-----------|
| HOLD | Nothing to do | No-op |
| SUPPLY_AAVE | Surplus > 2x burn | MCP: check balance, supply to best protocol |
| WITHDRAW_AAVE | Balance low | MCP: withdraw from yield positions |
| ADJUST_PRICING | Demand shift | Update price multipliers |
| REDUCE_COSTS | Costs too high | Switch to cheaper LLM model |
| EMERGENCY | Critical state | Shut down non-essentials |
| GATHER_INTELLIGENCE | THRIVING + idle | paidFetch: pay $0.02 for summarize service |
| SWAP_TOKENS | THRIVING + opportunity | Velora DEX: swap tokens for diversification |

### Two Execution Modes

1. **makeDecision()**: Claude analyzes status report, returns action recommendation (JSON)
2. **executeWithTools()**: Claude uses 19 MCP tools autonomously to carry out the action

## Yield Router

### Rate Query Flow

```
Query Rates (parallel, Promise.allSettled)
  |
  +-- Aave V3 (Eth + Base)
  |     pool.getReserveData() -> currentLiquidityRate (RAY, 1e27)
  |     Convert: APY = ((1 + rate/secondsPerYear)^secondsPerYear) - 1
  |     Supports: USDC + USDT
  |
  +-- Compound V3 (Eth Sepolia)
  |     comet.getUtilization() -> comet.getSupplyRate(utilization)
  |     Convert: APY = rate * secondsPerYear
  |     Supports: USDC only
  |
  +-- Morpho Blue (Eth Sepolia)
  |     morpho.market(id) -> totalSupply, totalBorrow, fee
  |     IRM.borrowRateView() * utilization * (1 - fee)
  |     Supports: USDC only (requires MORPHO_MARKET_ID env var)
  |
  v
Risk-Adjusted Sort
  riskAdjustedAPY = APY * (riskScore / 10)
  Aave: 9/10 | Compound: 8.5/10 | Morpho: 7.5/10
  |
  v
Route USDC and USDT independently
  Each token finds its own best protocol
  USDC: keep 2x monthly burn as liquid reserve
  USDT: no reserve (not used for operational costs)
```

### Rebalance Decision

```
IF currently in a position:
  1. Compare current APY vs best available
  2. IF APY diff < 0.5%: HOLD (not worth it)
  3. IF different USDC variant: HOLD (can't swap on testnet)
  4. Gas guard: project 30-day gain, compare to gas * 3
  5. IF gain > gas * 3: REBALANCE (withdraw + supply)
  6. IF supply cap exceeded: try next protocol

IF no position:
  1. Check surplus above reserve
  2. Query actual on-chain balance for best protocol's token
  3. Supply to highest risk-adjusted APY
  4. Fallback to next protocol on failure
```

### Morpho Blue Supply/Withdraw

Morpho Blue requires market params (tuple of 5 values) for supply/withdraw:

```
1. Fetch params on-chain: morpho.idToMarketParams(marketId)
2. Build tuple: [loanToken, collateralToken, oracle, irm, lltv]
3. Supply: morpho.supply(marketParams, amount, 0, address, '0x')
4. Withdraw: morpho.withdraw(marketParams, amount, 0, address, address)
```

## Cost Tracking

- **LLM costs**: Haiku $0.80/$4.00 per MTok, Sonnet $3/$15 per MTok
- **Gas costs**: Dynamic ETH pricing via Bitfinex
- **Daily limit**: $5 USDC/day (guard against runaway costs)
- **Monthly burn**: Estimated from 7-day rolling window
- **Decision cache**: Eliminates ~94% of LLM calls when agent state is stable
