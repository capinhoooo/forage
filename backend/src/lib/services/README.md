# Paid Services

8 services sold for USDC via x402/t402 micropayments. 3 AI services enhanced with MCP tools, 5 DeFi/data services powered by WDK modules.

## Files

| File | Purpose |
|------|---------|
| `analyze.ts` | AI data analysis ($0.05+ USDC, dynamic pricing) |
| `summarize.ts` | AI text summarization ($0.02+ USDC, dynamic pricing) |
| `review.ts` | AI code review ($0.10+ USDC, dynamic pricing) |
| `yield-oracle.ts` | Live DeFi APYs ($0.01 USDC, flat rate) |
| `price-feed.ts` | Bitfinex real-time pricing ($0.005 USDC, flat rate) |
| `swap-quote.ts` | Velora DEX aggregator quote ($0.005 USDC, flat rate) |
| `market-intel.ts` | AI-enhanced DeFi brief ($0.03 USDC, flat rate) |
| `price-history.ts` | Bitfinex historical data + trends ($0.01 USDC, flat rate) |
| `tool-enhanced.ts` | Shared `callWithTools()` utility for Claude + MCP |

## Service Architecture

```
                    +--- AI Services ---+          +--- DeFi Data Services ---+
                    |                   |          |                          |
                    | analyze           |          | yield-oracle             |
                    | summarize         |          | price-feed               |
                    | review            |          | swap-quote               |
                    | market-intel (AI) |          | price-history            |
                    |                   |          |                          |
                    | Uses Claude API   |          | Uses WDK modules         |
                    | + MCP tools       |          | (Bitfinex, Velora,       |
                    | Dynamic pricing   |          |  on-chain queries)       |
                    +-------------------+          | Flat pricing             |
                                                   +--------------------------+
```

## AI Service Flow

```
Client pays via x402/t402
    |
    v
Claude processes request with 19 MCP tools available
    |
    +-- If data mentions addresses/tokens/prices:
    |     Claude calls getTokenBalance, getCurrentPrice,
    |     getHistoricalPrice, etc. autonomously
    |
    v
Response includes: result + toolsUsed[]
```

All AI services use `callWithTools()` which:
1. Loads 19 MCP tools from WdkMcpServer
2. Passes them to Claude's `messages.create()` call
3. Handles the tool-use loop (max 3 iterations for cost control)
4. Falls back to plain Claude call if MCP tools unavailable

## DeFi Data Service Flow

```
Client pays via x402/t402
    |
    v
WDK module called directly (no LLM involved)
    |
    +-- yield-oracle: queryAllRates() -> on-chain APYs from 3 protocols
    +-- price-feed: BitfinexPricingClient.getCurrentPrice()
    +-- swap-quote: SwapVeloraEvm.quoteSwap()
    +-- price-history: BitfinexPricingClient.getHistoricalPrice()
    |
    v
Response with structured data
```

## Dynamic Pricing (AI Services)

AI services use tiered pricing. Base price covers initial characters, then extra cost per character:

| Service | Base Price | Threshold | Per-Char Above |
|---------|-----------|-----------|----------------|
| analyze | $0.05 | 200 chars | $0.000015/char |
| summarize | $0.02 | 300 chars | $0.000008/char |
| review | $0.10 | 500 chars | $0.000025/char |

Example: Analyzing 1000 chars = $0.05 base + 800 extra chars * $0.000015 = $0.062

## Flat-Rate Services

| Service | Price | Data Source |
|---------|-------|------------|
| yield-oracle | $0.01 | On-chain APYs (Aave V3, Compound V3, Morpho Blue) |
| price-feed | $0.005 | Bitfinex real-time (10 assets: BTC, ETH, SOL, etc.) |
| swap-quote | $0.005 | Velora DEX aggregator (Base Sepolia) |
| market-intel | $0.03 | Claude analysis of prices + yields combined |
| price-history | $0.01 | Bitfinex hourly candles (1-365 days, max 100 points) |

## Price History Service Details

Uses WDK `BitfinexPricingClient.getHistoricalPrice()`:

```
Input: { from: 'BTC', to: 'USD', days: 7 }
    |
    v
Fetch hourly candles from Bitfinex (max 100 points, 365 days back)
    |
    v
Calculate trend metrics:
  - trend: 'up' | 'down' | 'stable' (based on >1% change threshold)
  - changePercent: ((newest - oldest) / oldest) * 100
  - high / low across all data points
    |
    v
Output: { pair, points[], trend, changePercent, high, low, source, queriedAt }
```

Supported assets: BTC, ETH, USDT, XAU, SOL, AVAX, MATIC, ARB, OP, BNB

## State-Aware Model Selection

Services accept an `agentState` parameter that controls the LLM model:
- THRIVING: Claude Sonnet (better quality, higher cost)
- All other states: Claude Haiku (cost control)
