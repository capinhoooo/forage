# Forage Frontend

TanStack Start (React 19) dashboard for monitoring the autonomous AI agent. Displays real-time agent state, financial metrics, yield positions, and transaction history.

## Quick Start

```bash
cp .env.example .env    # Configure VITE_API_URL
bun install
bun dev                 # Start on port 3200
```

## Architecture

```
TanStack Start (React 19 SSR)
    |
    +-- TanStack Router (file-based routing)
    |     src/routes/__root.tsx    Root layout with providers
    |     src/routes/index.tsx     Dashboard home
    |
    +-- TanStack Query (server state)
    |     Fetches from backend API (port 3700)
    |     Agent status, history, P&L, yield, services
    |
    +-- UI Layer
    |     HeroUI component library
    |     Tailwind CSS 4 (dark theme default)
    |     GSAP + Lenis smooth scroll
    |     Motion (Framer Motion) for component animations
    |
    +-- Data Sources (Backend REST API)
          GET /agent/status     -> Life meter, state, balances
          GET /agent/pnl        -> P&L chart data
          GET /agent/history    -> Transaction timeline
          GET /agent/yield      -> DeFi position cards
          GET /agent/services   -> Service revenue breakdown
          GET /agent/states     -> State history chart
```

## Project Structure

```
src/
  components/              Shared components
    elements/              Reusable UI (AnimateComponent, etc.)
  routes/                  File-based routes (TanStack Router)
    __root.tsx             Root layout, providers, meta
    index.tsx              Dashboard
  providers/               React context providers
    HeroUIProvider.tsx     HeroUI theme
    LenisSmoothScrollProvider.tsx
    ThemeProvider.tsx
    WalletProvider.tsx
  hooks/                   Custom React hooks
  utils/
    style.ts               cnm() = clsx + tailwind-merge
    format.ts              Number/currency formatting
  lib/
    api.ts                 Backend API client
    wagmi.ts               Wallet connection config
    x402-browser.ts        x402 browser integration
  config/
    animation.ts           GSAP animation config
  integrations/
    tanstack-query/        Query client + devtools
```

## Commands

```bash
bun dev        # Dev server (port 3200)
bun build      # Production build
bun test       # Vitest
bun lint       # ESLint
bun check      # Prettier + ESLint fix
```

## Key Conventions

- **Import alias**: `@/` maps to `src/`
- **Styling**: `cnm()` for conditional classes (clsx + tailwind-merge)
- **Dark theme**: Default, `dark` class on `<html>`
- **No barrel files**: Import directly from source
- **Animations**: GSAP for scroll, Motion for components
