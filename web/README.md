# Forage Frontend

TanStack Start (React 19) dashboard for monitoring the autonomous AI agent. Displays real-time agent state, financial metrics, yield positions, transaction history, and interactive service testing with x402 payments.

## Quick Start

```bash
cp .env.example .env    # Set VITE_API_URL to backend URL
bun install
bun dev                 # Start on port 3200
```

## Architecture

```
TanStack Start (React 19 SSR)
    |
    +-- TanStack Router (file-based routing)
    |     src/routes/__root.tsx    Root layout with providers
    |     src/routes/index.tsx     Single-page dashboard (~2000 lines)
    |
    +-- TanStack Query (server state, auto-refetch)
    |     agent-status      15s interval
    |     agent-history     30s interval
    |     agent-pnl         60s interval
    |     agent-decisions   30s interval
    |     agent-spark       60s interval
    |     agent-services    30s interval
    |
    +-- UI Layer
    |     HeroUI component library
    |     Tailwind CSS 4 (paper-warm light theme)
    |     Motion (Framer Motion) for component animations
    |     Recharts for area charts
    |     RainbowKit + Wagmi for wallet connection
    |
    +-- Data Sources (Backend REST API)
          GET /agent/status      -> Life meter, state, balances, WDK modules
          GET /agent/pnl         -> P&L area chart (revenue vs costs)
          GET /agent/history     -> Transaction timeline with explorer links
          GET /agent/decisions   -> AI decision log with reasoning
          GET /agent/spark       -> Spark Lightning wallet info
          GET /agent/services    -> Service revenue breakdown
          GET /agent/states      -> Earnings history chart
          GET /.well-known/t402  -> Bazaar discovery catalog
```

## Dashboard Sections

The dashboard renders as a single-page cascade of sections:

| Section | Component | Description |
|---------|-----------|-------------|
| Header | `AgentHeader` | Forage logo, state badge, wallet address, uptime, ERC-8004 ID |
| How It Works | `HowItWorks` | Brief explanation of the agent's earning model |
| Life Meter | `LifeMeter` | Animated progress bar with pulse effects (CRITICAL/DESPERATE), shimmer (THRIVING), state badge, runway |
| Decisions | `DecisionLog` | Last 5 AI decisions with action badges, reasoning, yield router status |
| Financials | `StatsGrid` | 8 stats: total value, USDC/USDT balance, yield, runway, burn, P&L, earned |
| Wallets | `WalletOverview` | 3 wallet cards: EOA (Base Sepolia), ERC-4337 (Eth Sepolia, gasless badge), Spark (Lightning, zero-fee badge) |
| Earnings | `EarningsChart` | Area chart of total earned over time |
| P&L | `PnlChart` | Dual area chart (revenue green, costs red) with period selector (1h/24h/7d/30d) |
| State Timeline | `StateTimeline` | Historical state/balance snapshots |
| Services | `ServicesCatalog` | All 8 services with pricing and request counts |
| Try Service | `TryService` | Interactive form to call any service with x402 payment via connected wallet |
| Yield | `YieldPositions` | Aave/Compound/Morpho positions with risk scores |
| Rates | `CurrentRates` | Live APY rates across protocols |
| Bazaar | `BazaarDiscovery` | t402 service catalog (agent description, endpoints, payment methods) |
| Activity | `RecentActivity` | Transaction table with type badges, amounts, and block explorer links |
| Footer | `Footer` | Uptime, total requests, wallet address |

## Payment Flow (Try Service)

```
User selects service (e.g. "Analyze")
    |
    +-- Enters input text
    +-- Clicks "Preview" -> GET /services/analyze?data=...
    |     Returns HTTP 402 + payment requirements
    |     Dashboard shows price, network, pay-to address
    |
    +-- Clicks "Pay & Call" with connected wallet
          |
          +-- x402-browser.ts handles EIP-3009 TransferWithAuthorization
          +-- Signs USDC payment via MetaMask/RainbowKit
          +-- Retries request with payment header
          +-- Returns service result (analysis, summary, review, etc.)
```

## Project Structure

```
src/
  components/              Shared components
    elements/              AnimateComponent (GSAP scroll animations)
    art/                   ModularGrid decorative component
  routes/
    __root.tsx             Root layout, providers, meta, favicon
    index.tsx              Full dashboard (all sections above)
  providers/
    HeroUIProvider.tsx     HeroUI theme
    WalletProvider.tsx     RainbowKit + Wagmi (Base Sepolia)
    LenisSmoothScrollProvider.tsx
    ThemeProvider.tsx
  hooks/
    useLocalStorage.ts     Persistent local state
  utils/
    style.ts               cnm() = clsx + tailwind-merge
    format.ts              formatUiNumber, formatNumberToKMB
  lib/
    api.ts                 Backend API client (typed, all endpoints)
    wagmi.ts               Wagmi config (Base Sepolia chain)
    x402-browser.ts        x402 payment client (EIP-3009)
    polyfills.ts           Browser crypto polyfills
  config/
    animation.ts           Easing presets, spring configs
  integrations/
    tanstack-query/        Query client + devtools
  styles.css               Global styles, animations (pulse, skeleton, shimmer)
```

## Animations

| Animation | Class | Usage |
|-----------|-------|-------|
| Pulse (critical) | `.pulse-critical` | Life meter bar when CRITICAL state |
| Pulse (desperate) | `.pulse-desperate` | Life meter bar when DESPERATE state |
| Shimmer | `.shimmer-bar` | Life meter bar when THRIVING state |
| Heartbeat | `.heartbeat` | Alive indicator dot (3s loop) |
| Heartbeat fast | `.heartbeat-fast` | Alive dot when CRITICAL (1s loop) |
| Skeleton | `.skeleton` | Loading shimmer for placeholder cards |
| Fade in | `.enter` | Section entrance animation |
| Stagger | `.stagger` | Sequential children fade-in (40ms delay) |
| New activity | `.activity-new` | Green highlight on recent transactions |

## Commands

```bash
bun dev        # Dev server (port 3200)
bun build      # Production build (Nitro SSR)
bun test       # Vitest
bun lint       # ESLint
bun check      # Prettier + ESLint fix
```

## Deployment

Frontend deploys to Netlify with Nitro preset:
- `web/netlify.toml` configures build command and publish directory
- Static assets output to `dist/`
- Server functions output to `.netlify/functions-internal/`
- Set `VITE_API_URL` env var to the backend Railway URL

## Key Conventions

- **Import alias**: `@/` maps to `src/`
- **Styling**: `cnm()` for conditional classes, inline styles for component-specific styling
- **Theme**: Paper-warm light (#f7f7f5 background, #1a1a1a text)
- **No barrel files**: Import directly from source
- **Animations**: Motion (Framer) for components, CSS keyframes for persistent effects
