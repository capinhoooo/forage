# Payment Layer

Dual-protocol payment system supporting both **x402** and **t402** micropayment protocols with fully embedded facilitators and Bazaar service discovery.

## Files

| File | Purpose |
|------|---------|
| `middleware.ts` | Request middleware: detects protocol, verifies payment, adds Bazaar extensions, settles on-chain |
| `local-facilitator.ts` | Embedded x402 facilitator (no external HTTP dependency) |
| `local-facilitator-t402.ts` | Embedded t402 facilitator (exact + exact-legacy schemes) |
| `facilitator-signer.ts` | Viem-based signer implementing FacilitatorEvmSigner (7 methods) |
| `payment-client.ts` | Client-side: auto-handles 402 responses for agent-to-agent payments |
| `discovery.ts` | Bazaar discovery extensions for all 8 services |

## Payment Flow (Server Side)

```
Client Request
    |
    v
Middleware: detectProtocol(header)
    |
    +-- No payment header?
    |     Return 402 Payment Required with:
    |       x402 headers: price, token, payTo, network
    |       Bazaar extension: input schema + output example
    |       ERC-8004 extension: agent identity
    |
    +-- x402Version found --> x402 facilitator
    |                            verify() -> execute service -> settle()
    |
    +-- t402Version found --> t402 facilitator
                                 verify() -> execute service -> settle()
    |
    v
Route Handler executes service
    |
    v
settlePayment() -> on-chain USDC transfer
```

## Protocol Support

| Protocol | Schemes | Tokens | Chains |
|----------|---------|--------|--------|
| x402 | exact (EIP-3009) | USDC | Base Sepolia |
| t402 | exact + exact-legacy | USDC, USDt | Base Sepolia, Eth Sepolia |

## Embedded Facilitator Architecture

Both facilitators run in-process, eliminating external dependencies:

```typescript
// x402
const facilitator = new x402Facilitator();
registerExactEvmScheme(facilitator, { eip155: { 84532: signer } });

// t402 (same pattern)
const t402fac = new t402Facilitator();
registerExactEvmScheme(t402fac, { eip155: { 84532: signer } });
```

The `FacilitatorEvmSigner` bridges WDK wallet to viem operations:
- `readContract` / `writeContract` / `sendTransaction` : On-chain operations
- `verifyTypedData` : EIP-712 signature verification
- `getCode` / `getAddresses` : Contract introspection
- `waitForTransactionReceipt` : Transaction confirmation

## Bazaar Discovery Extensions

Every 402 response includes machine-readable Bazaar extensions so other agents can discover and understand our services programmatically:

```
402 Response
  |
  +-- x402 Headers (price, token, payTo, network)
  |
  +-- Bazaar Extension (per-route):
  |     {
  |       "bazaar": {
  |         "info": {
  |           "input": { "from": "BTC", "to": "USD" }
  |         },
  |         "schema": {
  |           "inputSchema": {
  |             "properties": { "from": {...}, "to": {...} },
  |             "required": ["from"]
  |           },
  |           "output": {
  |             "example": { "pair": "BTC/USD", "price": 97234.5 }
  |           }
  |         }
  |       }
  |     }
  |
  +-- ERC-8004 Extension:
        { "agentId": 1769, "registryId": "eip155:84532:0x8004..." }
```

The `bazaarResourceServerExtension` from `@t402/extensions/bazaar` is registered on both x402 and t402 servers. Extensions are declared per-route in `discovery.ts` using `declareDiscoveryExtension()`.

### Discovery Extension Coverage

| Endpoint | Input Schema | Output Example |
|----------|-------------|----------------|
| `/services/analyze` | `{ data: string }` | Analysis + insights + toolsUsed |
| `/services/summarize` | `{ text: string }` | Summary + keyPoints |
| `/services/review` | `{ code: string, language?: string }` | Review + suggestions + score |
| `/services/yield-oracle` | `{}` (no input) | Rates + bestOpportunity |
| `/services/price-feed` | `{ from: string, to?: string }` | Pair + price + source |
| `/services/swap-quote` | `{ tokenIn, tokenOut, amount }` | AmountIn/Out + fee |
| `/services/market-intel` | `{ tokens?: string }` | Brief + prices + topYield |
| `/services/price-history` | `{ from, to?, days? }` | Points + trend + change% |

## Agent-to-Agent (Client Side)

```typescript
import { paidFetch } from './payment-client.ts';

// Automatically handles 402 -> WDK sign EIP-3009 -> retry with payment
const response = await paidFetch('https://other-agent.com/services/analyze?data=hello');
```

Uses `@t402/wdk`'s `createWDKSigner` for EIP-3009 `TransferWithAuthorization` signing.

## ERC-8004 Extension

Payment responses include ERC-8004 identity data so clients can verify the agent on-chain before paying:

```json
{
  "extensions": {
    "erc8004": {
      "agentId": 1769,
      "registryId": "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e"
    }
  }
}
```

## Key Technical Notes

- **x402 facilitator** (`x402.org/facilitator`) supports testnet (`eip155:84532`)
- **t402 facilitator** (`facilitator.t402.io`) does NOT support testnet (returns `t402Version` but no EVM chains)
- **Solution**: Both protocols use embedded local facilitators, no external HTTP dependency
- **`@t402/fastify` incompatibility**: Plugin reads `t402Version` from response, but x402 facilitator returns `x402Version`. We bypass this with custom middleware.
