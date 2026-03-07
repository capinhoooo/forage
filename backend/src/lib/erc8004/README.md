# ERC-8004 On-Chain Identity

Agent identity registration and verification on the ERC-8004 IdentityRegistry.

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Registration, querying, verification, t402 extension building |
| `reputation.ts` | On-chain reputation queries from ReputationRegistry |

## What is ERC-8004?

ERC-8004 defines an on-chain identity standard for AI agents. Each agent is an ERC-721 NFT on the IdentityRegistry with:
- **agentId**: Unique identifier (our agent: #1769)
- **agentWallet**: The wallet address that represents the agent
- **agentURI**: Metadata about the agent's capabilities
- **owner**: The wallet that controls the agent identity

## Contracts (CREATE2 deterministic, same on all testnets)

| Contract | Address |
|----------|---------|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

## Integration Flow

```
Agent Startup
    |
    v
buildERC8004Extension(agentId)
    |  Read agent data from IdentityRegistry contract
    |  Build extension object for 402 responses
    |
    v
Payment Middleware
    |  Include ERC-8004 extension in every 402 response
    |  Clients can verify agent identity on-chain before paying
    |
    v
Client verifies: Is agent #1769 real? Does its wallet match?
    |  Read IdentityRegistry.agentWallet(1769)
    |  Compare with payTo address in 402 response
    |
    v
Trust established -> Client pays -> Service delivered
```

## Integration Points

### 402 Payment Responses
Every 402 response includes the ERC-8004 extension:
```json
{ "extensions": { "erc8004": { "agentId": 1769, "registryId": "eip155:84532:0x8004..." } } }
```

### MCP Tools
Claude can use `getAgentIdentity` and `verifyAgent` tools to check on-chain identities of other agents before interacting.

### Agent Status API
`GET /agent/status` includes identity info when `ERC8004_AGENT_ID` is configured.

### Bazaar Discovery
`/.well-known/t402/discovery` includes agent identity in the catalog header.

## Key Exports

- `registerAgent(uri)` : Register new agent on IdentityRegistry
- `getOurAgentIdentity(id)` : Query agent identity
- `verifyAgentOwnership(id, owner)` : Verify owner of agent NFT
- `getAgentWallet(id)` : Read wallet address from contract
- `buildERC8004Extension(id)` : Build t402 extension object

## Technical Notes

- Agent ID is parsed from `Transfer` event `topics[3]` (ERC-721 mint)
- SDK `getAgentIdentity()` has wallet parsing issues; `getAgentWallet()` reads contract directly
- Uses viem for contract reads (compatible with WDK wallet for writes)
