import { x402Client, x402HTTPClient } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { createWDKSigner } from '@t402/wdk';
import { getWdk } from '../wdk/index.ts';
import { PRIMARY_CHAIN } from '../wdk/config.ts';

let paymentFetchInstance: ((input: string | URL | Request, init?: RequestInit) => Promise<Response>) | null = null;

/**
 * Build a ClientEvmSigner from WDK via @t402/wdk's createWDKSigner.
 * WDKSigner implements ClientEvmSigner (address + signTypedData).
 */
async function buildClientSigner() {
  const wdk = getWdk();
  return createWDKSigner(wdk as any, PRIMARY_CHAIN);
}

/**
 * Create a fetch function that auto-handles 402 Payment Required responses.
 * Uses x402 protocol: on 402, parses requirements, signs EIP-3009, retries with payment header.
 *
 * Usage:
 *   const payFetch = await createPaymentFetch();
 *   const res = await payFetch('https://some-agent.com/services/analyze?data=hello');
 */
export async function createPaymentFetch(): Promise<(input: string | URL | Request, init?: RequestInit) => Promise<Response>> {
  if (paymentFetchInstance) return paymentFetchInstance;

  const signer = await buildClientSigner();

  const client = new x402Client();
  registerExactEvmScheme(client, { signer: signer as any });
  const httpClient = new x402HTTPClient(client);

  // Build a fetch wrapper that handles 402 responses (same pattern as @t402/fetch)
  paymentFetchInstance = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const response = await fetch(input, init);
    if (response.status !== 402) return response;

    // Parse payment requirements
    const getHeader = (name: string) => response.headers.get(name);
    let body: unknown;
    try {
      const text = await response.text();
      if (text) body = JSON.parse(text);
    } catch {}

    const paymentRequired = httpClient.getPaymentRequiredResponse(getHeader, body);
    const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
    const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

    // Retry with payment header
    return fetch(input, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        ...paymentHeaders,
      },
    });
  };

  console.log(`[PaymentClient] x402 client initialized with signer ${signer.address}`);
  return paymentFetchInstance;
}

/**
 * Make a paid request to another agent's service endpoint.
 * Convenience wrapper around createPaymentFetch.
 */
export async function paidFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const payFetch = await createPaymentFetch();
  return payFetch(url, init);
}
