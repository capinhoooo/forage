import { t402Facilitator } from '@t402/core/facilitator';
import { registerExactEvmScheme as registerT402EvmScheme } from '@t402/evm/exact/facilitator';
import { registerPermit2EvmScheme as registerPermit2FacilitatorScheme } from '@t402/evm/permit2/facilitator';
import { ExactLegacyEvmFacilitatorScheme } from '@t402/evm';
import { buildFacilitatorEvmSigner, buildFacilitatorEvmSignerForChain } from './facilitator-signer.ts';
import { CHAINS, PRIMARY_CHAIN } from '../wdk/config.ts';

let localT402Client: LocalT402FacilitatorClient | null = null;

/**
 * LocalT402FacilitatorClient implements the FacilitatorClient interface
 * by wrapping a local t402Facilitator instance.
 * Supports:
 *   - exact (USDC via EIP-3009) on Base Sepolia + Eth Sepolia
 *   - exact-legacy (USDT via approve+transferFrom) on both chains
 *   - permit2 (Uniswap Permit2) on both chains
 * Coexists with the x402 LocalFacilitatorClient.
 */
export class LocalT402FacilitatorClient {
  private facilitator: InstanceType<typeof t402Facilitator>;

  constructor(facilitator: InstanceType<typeof t402Facilitator>) {
    this.facilitator = facilitator;
  }

  async verify(paymentPayload: any, paymentRequirements: any) {
    return this.facilitator.verify(paymentPayload, paymentRequirements);
  }

  async settle(paymentPayload: any, paymentRequirements: any) {
    return this.facilitator.settle(paymentPayload, paymentRequirements);
  }

  async getSupported() {
    return Promise.resolve(this.facilitator.getSupported());
  }
}

/**
 * Create and initialize the local t402 facilitator client.
 * Registers schemes for both Base Sepolia and Ethereum Sepolia.
 */
export async function createLocalT402FacilitatorClient(): Promise<LocalT402FacilitatorClient> {
  if (localT402Client) return localT402Client;

  const facilitator = new t402Facilitator();

  // --- Base Sepolia (eip155:84532): exact scheme for USDC ---
  const baseSepoliaSigner = await buildFacilitatorEvmSigner();
  const baseNetwork = CHAINS[PRIMARY_CHAIN].caip2;

  registerT402EvmScheme(facilitator, {
    signer: baseSepoliaSigner,
    networks: baseNetwork,
  });

  // Also register exact-legacy on Base Sepolia (for future if USDT appears)
  facilitator.register(baseNetwork, new ExactLegacyEvmFacilitatorScheme(baseSepoliaSigner as any));

  // Permit2 on Base Sepolia
  registerPermit2FacilitatorScheme(facilitator, {
    signer: baseSepoliaSigner,
    networks: baseNetwork,
  });

  console.log(`[Facilitator] t402 exact + exact-legacy + permit2 registered for ${baseNetwork}`);

  // --- Ethereum Sepolia (eip155:11155111): exact + exact-legacy + permit2 for USDT ---
  const ethSepoliaSigner = await buildFacilitatorEvmSignerForChain('ethereum-sepolia');
  const ethNetwork = CHAINS['ethereum-sepolia'].caip2;

  registerT402EvmScheme(facilitator, {
    signer: ethSepoliaSigner,
    networks: ethNetwork,
  });

  facilitator.register(ethNetwork, new ExactLegacyEvmFacilitatorScheme(ethSepoliaSigner as any));

  // Permit2 on Eth Sepolia
  registerPermit2FacilitatorScheme(facilitator, {
    signer: ethSepoliaSigner,
    networks: ethNetwork,
  });

  console.log(`[Facilitator] t402 exact + exact-legacy + permit2 registered for ${ethNetwork}`);

  localT402Client = new LocalT402FacilitatorClient(facilitator);
  console.log(`[Facilitator] Local t402 facilitator initialized (dual-chain: ${baseNetwork} + ${ethNetwork})`);

  return localT402Client;
}
