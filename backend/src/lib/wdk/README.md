# WDK Wallet Layer

Core wallet infrastructure using **Tether's Wallet Development Kit (WDK)**. Manages wallets, protocols, pricing, and the T402 payment signing bridge.

## Files

| File | Purpose |
|------|---------|
| `index.ts` | WDK initialization, wallet registration, balance queries, signer exports, pricing client |
| `config.ts` | Chain configs, token addresses, protocol addresses (Aave/Compound/Morpho), service prices |

## Architecture

```
WDK Seed (BIP-39)
    |
    v
@tetherto/wdk (Core Orchestrator)
    |
    +-- WalletManagerEvm (Base Sepolia, EOA)
    |     |
    |     +-- Receives x402/t402 payments
    |     +-- Signs facilitator transactions (EIP-3009)
    |     +-- Direct Aave V3 supply/withdraw (USDC + USDT)
    |     +-- Velora DEX swap execution
    |
    +-- WalletManagerEvmErc4337 (Eth Sepolia, Smart Account)
    |     |
    |     +-- Safe v1.4.1 contract wallet
    |     +-- Batched DeFi operations (approve + supply = 1 UserOp)
    |     +-- Aave V3 + Compound V3 + Morpho Blue
    |     +-- Gas paid in USDC via Pimlico paymaster
    |
    +-- BitfinexPricingClient
    |     +-- getCurrentPrice({ from, to })        Real-time prices
    |     +-- getHistoricalPrice({ from, to,        Hourly candles
    |           start, end })                        Max 100 points, 365 days
    |
    +-- SwapVeloraEvm
    |     +-- quoteSwap({ tokenIn, tokenOut, amount })   Read-only quote
    |     +-- swap({ tokenIn, tokenOut, amount })        Execute swap
    |
    +-- BridgeUsdt0Evm
    |     +-- bridge({ amount, fromChain, toChain })
    |     (mainnet chain IDs only; registered but not usable on testnet)
    |
    +-- LendingAaveEvm
          +-- Mainnet-only address map
          (testnet: we call Pool contract directly via ethers.js)

@t402/wdk (T402 Wrapper)
    |
    +-- T402WDK.fromWDK(wdk, chainConfigs)
    |     Wraps existing WDK instance (no re-initialization)
    |
    +-- createWDKSigner(wdk, chainName)
          Returns ClientEvmSigner: { address, signTypedData() }
          Used for EIP-3009 TransferWithAuthorization
```

## Chains

| Chain | Type | Network ID | Role |
|-------|------|-----------|------|
| Base Sepolia | EOA | `eip155:84532` | Payments, Aave V3, Velora swaps |
| Ethereum Sepolia | ERC-4337 | `eip155:11155111` | Yield (Aave, Compound, Morpho) |
| Arbitrum Sepolia | Configured | `eip155:421614` | Potential future yield chain |

## Token Addresses

### Base Sepolia
| Token | Address | Purpose |
|-------|---------|---------|
| Circle USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | x402 payments |
| Aave USDC | `0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f` | Yield (Aave V3) |
| Aave aUSDC | `0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC` | Aave receipt token |

### Ethereum Sepolia
| Token | Address | Purpose |
|-------|---------|---------|
| Circle USDC | `0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8` | Aave supply |
| Aave USDT | `0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0` | USDT yield |

**Important**: Circle USDC and Aave test USDC are different tokens. Do not mix them up.

## Service Pricing (in USDC base units, 6 decimals)

| Service | Base Price | Threshold | Per-Char |
|---------|-----------|-----------|----------|
| analyze | 50,000 ($0.05) | 200 chars | 15 |
| summarize | 20,000 ($0.02) | 300 chars | 8 |
| review | 100,000 ($0.10) | 500 chars | 25 |
| yield-oracle | 10,000 ($0.01) | flat | - |
| price-feed | 5,000 ($0.005) | flat | - |
| swap-quote | 5,000 ($0.005) | flat | - |
| market-intel | 30,000 ($0.03) | flat | - |
| price-history | 10,000 ($0.01) | flat | - |

## Key Exports

- `getWdk()` / `getT402Wdk()` : Get WDK instances
- `getWalletAddress()` / `get4337WalletAddress()` : Wallet addresses
- `getEoaWallet(chain)` / `getEoaAddress()` : EOA ethers.js Wallet for direct DeFi calls
- `getUsdcBalance()` / `getUsdtBalance()` / `getEthBalance()` : Token balances
- `getAccount(chain)` / `get4337Account()` : Signing accounts
- `getPricingClient()` : Bitfinex pricing client
- `disposeWdk()` : Cleanup

## WDK Modules Used (7)

1. `@tetherto/wdk` : core orchestrator
2. `@tetherto/wdk-wallet-evm` : EOA wallet
3. `@tetherto/wdk-wallet-evm-erc-4337` : Smart Account
4. `@tetherto/wdk-protocol-lending-aave-evm` : Aave V3 (mainnet addresses)
5. `@tetherto/wdk-protocol-bridge-usdt0-evm` : USDT0 bridge (mainnet only)
6. `@tetherto/wdk-protocol-swap-velora-evm` : Velora swap
7. `@tetherto/wdk-pricing-bitfinex-http` : price feeds (real-time + historical)

## DeFi Protocol Config

### Aave V3

| Chain | Pool | USDC | aUSDC |
|-------|------|------|-------|
| Base Sepolia | `0x8bAB...` | `0xba50...` | `0x10F1...` |
| Ethereum Sepolia | `0x6Ae4...` | `0x94a9...` | via getReserveData |

### Compound V3

| Chain | Comet | USDC |
|-------|-------|------|
| Ethereum Sepolia | `0xAec1...` | Circle USDC |

### Morpho Blue

| Chain | Morpho | IRM | Market ID |
|-------|--------|-----|-----------|
| Ethereum Sepolia | `0xd011...` | `0x8C5d...` | From `MORPHO_MARKET_ID` env |

Morpho requires fetching `idToMarketParams(marketId)` on-chain to get the 5-element tuple needed for supply/withdraw calls.
