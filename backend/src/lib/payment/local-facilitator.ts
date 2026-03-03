import { x402Facilitator } from '@x402/core/facilitator';
import { registerExactEvmScheme as registerX402EvmScheme } from '@x402/evm/exact/facilitator';
import { buildFacilitatorEvmSigner } from './facilitator-signer.ts';
import { CHAINS, PRIMARY_CHAIN } from '../wdk/config.ts';

let localClient: LocalFacilitatorClient | null = null;

/**
 * LocalFacilitatorClient implements the FacilitatorClient interface
 * by wrapping a local x402Facilitator instance.
 * No external HTTP facilitator dependency needed.
 */
export class LocalFacilitatorClient {
  private facilitator: InstanceType<typeof x402Facilitator>;

  constructor(facilitator: InstanceType<typeof x402Facilitator>) {
    this.facilitator = facilitator;
  }

  async verify(paymentPayload: any, paymentRequirements: any) {
    return this.facilitator.verify(paymentPayload, paymentRequirements);
  }

  async settle(paymentPayload: any, paymentRequirements: any) {
    return this.facilitator.settle(paymentPayload, paymentRequirements);
  }

  async getSupported() {
    // x402Facilitator.getSupported() is synchronous, wrap in Promise
    return Promise.resolve(this.facilitator.getSupported());
  }
}

/**
 * Create and initialize the local facilitator client.
 * Registers the EVM exact scheme with the WDK wallet as signer.
 */
export async function createLocalFacilitatorClient(): Promise<LocalFacilitatorClient> {
  if (localClient) return localClient;

  // Build the viem-based signer from WDK wallet
  const signer = await buildFacilitatorEvmSigner();

  // Create x402 facilitator and register EVM scheme
  const facilitator = new x402Facilitator();
  const network = CHAINS[PRIMARY_CHAIN].caip2;

  registerX402EvmScheme(facilitator, {
    signer,
    networks: network,
  });

  localClient = new LocalFacilitatorClient(facilitator);
  console.log(`[Facilitator] Local x402 facilitator initialized for ${network}`);

  return localClient;
}
