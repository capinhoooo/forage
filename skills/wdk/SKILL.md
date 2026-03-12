---
name: wdk
description: Tether Wallet Development Kit (WDK) for building non-custodial multi-chain wallets. Use when working with @tetherto/wdk, wallet modules (wdk-wallet-evm, wdk-wallet-evm-erc-4337, wdk-wallet-spark, wdk-wallet-btc, wdk-wallet-solana, wdk-wallet-ton, wdk-wallet-tron), and protocol modules including swap (wdk-protocol-swap-velora-evm), bridge (wdk-protocol-bridge-usdt0-evm), lending (wdk-protocol-lending-aave-evm), and fiat (wdk-protocol-fiat-moonpay). Covers wallet creation, transactions, token transfers, DEX swaps, cross-chain bridges, DeFi lending/borrowing, and fiat on/off ramps.
---

# Tether WDK Agent Skill

This skill enables AI agents to manage self-custodial wallets across 13+ blockchains using Tether's Wallet Development Kit.

## Source

Official WDK agent skill from Tether: `npx skills add tetherto/wdk-agent-skills`

Full documentation: https://docs.wdk.tether.io/ai/agent-skills

## Capabilities

- **Wallets**: Create and manage wallets on EVM, Bitcoin, Solana, Spark (Lightning), TON, TRON
- **Transactions**: Native token and token transfers (ERC-20, SPL, Jetton, TRC-20)
- **Swaps**: DEX operations via Velora (EVM) and StonFi (TON)
- **Bridges**: Cross-chain transfers using USDT0 via LayerZero
- **Lending**: Aave V3 supply, borrow, repay, withdraw
- **Fiat**: MoonPay integration for crypto purchases and sales
- **Gasless**: Fee-free transfers on TON and TRON, ERC-4337 on EVM
- **Spark Lightning**: Zero-fee Bitcoin transfers, Lightning invoices and payments

## Architecture

```
BIP-39 Seed Phrase
    |
    v
WDK Core (orchestrator)
    |
    +-- Wallet Manager (EVM)     --> accounts[0..n]
    +-- Wallet Manager (ERC4337) --> Smart Accounts (Safe)
    +-- Wallet Manager (Spark)   --> Lightning + BTC L1
    +-- Wallet Manager (BTC)     --> accounts[0..n]
    +-- Wallet Manager (Solana)  --> accounts[0..n]
    +-- Wallet Manager (TON)     --> accounts[0..n]
    |
    +-- Protocol: Swap (Velora)
    +-- Protocol: Bridge (USDT0/LayerZero)
    +-- Protocol: Lending (Aave V3)
    +-- Protocol: Fiat (MoonPay)
```

## Common Interface (IWalletAccount)

All wallet accounts share these methods:
- `getAddress()` - Get wallet address
- `getBalance()` - Get native token balance
- `getTokenBalance(tokenAddress)` - Get ERC20/SPL/Jetton balance
- `sendTransaction(tx)` - Send native tokens
- `transfer(to, amount, tokenAddress)` - Transfer tokens
- `sign(message)` - Sign a message
- `verify(message, signature)` - Verify a signature
- `dispose()` - Clean up private keys from memory

## Security Rules

All write operations (sendTransaction, transfer, sign, swap, bridge, supply, borrow) require explicit human confirmation before execution. Never expose seed phrases, private keys, or keyPair data. Always call dispose() in finally blocks.

## How Forage Uses WDK

Forage integrates 10 WDK modules for autonomous economic operations:
1. EOA wallet on Base Sepolia (payment receipt, x402 signing)
2. ERC-4337 Smart Account on Ethereum Sepolia (gasless batched DeFi)
3. Spark Lightning wallet (zero-fee Bitcoin transfers)
4. Aave V3 lending (yield generation via MCP tools)
5. Velora swap (token rebalancing)
6. USDT0 bridge (cross-chain value transfer)
7. Bitfinex pricing (real-time + historical price data)
8. Secret Manager (encrypted seed storage)
9. MCP Toolkit (34 tools exposed to Claude AI)
10. Indexer API (multi-chain balance and transfer history)
