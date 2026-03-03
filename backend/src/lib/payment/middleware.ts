import { x402ResourceServer } from '@x402/core/server';
import { x402HTTPResourceServer } from '@x402/core/http';
import { registerExactEvmScheme as registerX402ExactEvmScheme } from '@x402/evm/exact/server';
import { t402ResourceServer } from '@t402/core/server';
import { t402HTTPResourceServer } from '@t402/core/http';
import { registerExactEvmScheme as registerT402ExactEvmScheme } from '@t402/evm/exact/server';
import { ExactLegacyEvmServerScheme } from '@t402/evm';
import { registerPermit2EvmScheme } from '@t402/evm/permit2/server';
import { declarePaymentIdExtension, PAYMENT_ID_EXTENSION_KEY } from '@t402/extensions/payment-id';
import { declareSIWxExtension, SIWX_EXTENSION_KEY } from '@t402/extensions/sign-in-with-x';
import {
  declareEip2612GasSponsorExtension,
  EIP2612_GAS_SPONSOR_EXTENSION_KEY,
} from '@t402/extensions/eip2612-gas-sponsoring';
import {
  declareERC20ApprovalGasSponsorExtension,
  ERC20_APPROVAL_GAS_SPONSOR_EXTENSION_KEY,
} from '@t402/extensions/erc20-approval-gas-sponsoring';
import {
  erc8004ReputationCheck,
  erc8004SubmitFeedback,
  erc8004ResourceServerExtension,
  erc8004ServerIdentityCheck,
  FEEDBACK_TAGS,
  REPUTATION_REGISTRIES,
} from '@t402/erc8004';
import { bazaarResourceServerExtension } from '@t402/extensions/bazaar';
import { createLocalFacilitatorClient } from './local-facilitator.ts';
import { createLocalT402FacilitatorClient } from './local-facilitator-t402.ts';
import { getWalletAddress } from '../wdk/index.ts';
import { SERVICE_PRICES, CHAINS, calculateServicePrice } from '../wdk/config.ts';
import { USDT_ETH_SEPOLIA, ERC8004_AGENT_ID } from '../../config/main-config.ts';
import { buildERC8004Extension, AGENT_REGISTRY_ID } from '../erc8004/index.ts';
import { submitPositiveFeedback } from '../erc8004/reputation.ts';
import { getDiscoveryExtension, validateAllDiscovery } from './discovery.ts';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import type { preHandlerHookHandler } from 'fastify';

let middlewareInstance: preHandlerHookHandler | null = null;
let x402HttpServer: InstanceType<typeof x402HTTPResourceServer> | null = null;
let t402HttpServer: InstanceType<typeof t402HTTPResourceServer> | null = null;

/**
 * Detect protocol version from a base64-encoded PAYMENT-SIGNATURE header.
 * Returns 'x402', 't402', or null if unrecognizable.
 */
function detectProtocol(paymentHeader: string): 'x402' | 't402' | null {
  try {
    const decoded = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf-8'));
    if (decoded.x402Version != null) return 'x402';
    if (decoded.t402Version != null) return 't402';
    return null;
  } catch {
    return null;
  }
}

export async function createPaymentMiddleware(): Promise<preHandlerHookHandler> {
  if (middlewareInstance) return middlewareInstance;

  const payToAddress = await getWalletAddress();
  console.log(`[Payment] Pay-to address: ${payToAddress}`);

  // Initialize both embedded facilitators
  const x402Client = await createLocalFacilitatorClient();
  const t402Client = await createLocalT402FacilitatorClient();
  console.log('[Payment] Both x402 and t402 local facilitators initialized');

  const network = 'eip155:84532';

  // --- x402 Resource Server (USDC via exact scheme) ---
  const x402Server = new x402ResourceServer(x402Client as any);
  registerX402ExactEvmScheme(x402Server, {});
  await x402Server.initialize();

  // Register Bazaar discovery extension (enriches 402 responses with HTTP method)
  try {
    x402Server.registerExtension(bazaarResourceServerExtension as any);
    console.log('[Payment] Bazaar discovery extension registered on x402 server');
  } catch (err: any) {
    console.warn(`[Payment] Bazaar extension on x402 skipped: ${err.message}`);
  }

  const x402Routes: Record<string, any> = buildRoutes('exact', network, payToAddress);
  x402HttpServer = new x402HTTPResourceServer(x402Server, x402Routes);

  // --- t402 Resource Server (multi-chain: Base Sepolia + Eth Sepolia) ---
  const t402Server = new t402ResourceServer(t402Client as any);
  const ethNetwork = CHAINS['ethereum-sepolia'].caip2;

  // Register exact scheme on both networks
  registerT402ExactEvmScheme(t402Server, { networks: [network, ethNetwork] });
  // Register exact-legacy scheme on both networks (USDT support)
  t402Server.register(network, new ExactLegacyEvmServerScheme() as any);
  t402Server.register(ethNetwork, new ExactLegacyEvmServerScheme() as any);
  // Register Permit2 scheme on both networks (Uniswap Permit2 at 0x000...22D473)
  registerPermit2EvmScheme(t402Server, { networks: [network, ethNetwork] });
  console.log('[Payment] Permit2 scheme registered on both networks');

  // --- ERC-8004 Advanced Hooks (t402 server only) ---
  if (ERC8004_AGENT_ID) {
    const viemClient = createPublicClient({ chain: baseSepolia, transport: http() });
    const reputationRegistry = REPUTATION_REGISTRIES[network] || REPUTATION_REGISTRIES['eip155:84532'];

    if (reputationRegistry) {
      // Pre-verify: check payer reputation (warn mode, don't reject for hackathon)
      t402Server.onBeforeVerify(
        erc8004ReputationCheck(viemClient as any, reputationRegistry, {
          minScore: 0,
          trustedReviewers: [payToAddress as `0x${string}`],
          onBelowThreshold: 'warn',
        }) as any,
      );
      console.log('[Payment] ERC-8004 reputation check hook registered (warn mode)');

      // Server identity check: verify payTo matches on-chain agent wallet
      t402Server.onBeforeVerify(erc8004ServerIdentityCheck(viemClient as any) as any);
      console.log('[Payment] ERC-8004 server identity check hook registered');

      // Live reputation scores in 402 responses
      try {
        t402Server.registerExtension(
          erc8004ResourceServerExtension({
            client: viemClient as any,
            reputationRegistry,
            trustedReviewers: [payToAddress as `0x${string}`],
          }) as any,
        );
        console.log('[Payment] ERC-8004 live reputation extension registered');
      } catch (err: any) {
        console.warn(`[Payment] ERC-8004 live reputation extension skipped: ${err.message}`);
      }
    }
  }

  // --- Payment Lifecycle Hooks (both servers) ---

  // AfterVerify: log successful payment verifications for analytics
  const afterVerifyHook = async (context: any): Promise<void> => {
    const resource = context?.requirements?.resource?.url || 'unknown';
    const payer = context?.result?.payer || 'unknown';
    console.log(`[Payment] Verified: ${resource} from ${payer}`);
  };
  t402Server.onAfterVerify(afterVerifyHook);
  x402Server.onAfterVerify(afterVerifyHook);

  // OnVerifyFailure: log failed verifications for debugging
  const onVerifyFailureHook = async (context: any): Promise<void> => {
    const resource = context?.requirements?.resource?.url || 'unknown';
    const error = context?.error?.message || 'unknown error';
    console.warn(`[Payment] Verify failed: ${resource} reason=${error}`);
  };
  t402Server.onVerifyFailure(onVerifyFailureHook);
  x402Server.onVerifyFailure(onVerifyFailureHook);

  // BeforeSettle: validate settlement (guard against zero-amount or suspicious payloads)
  const beforeSettleHook = async (context: any): Promise<void | { abort: true; reason: string }> => {
    const amount = context?.requirements?.amount;
    if (amount && BigInt(amount) <= 0n) {
      return { abort: true, reason: 'Settlement amount must be positive' };
    }
  };
  t402Server.onBeforeSettle(beforeSettleHook);
  x402Server.onBeforeSettle(beforeSettleHook);

  // OnSettleFailure: log settlement failures
  const onSettleFailureHook = async (context: any): Promise<void> => {
    const resource = context?.requirements?.resource?.url || 'unknown';
    const error = context?.error?.message || 'unknown error';
    console.error(`[Payment] Settle failed: ${resource} reason=${error}`);
  };
  t402Server.onSettleFailure(onSettleFailureHook);
  x402Server.onSettleFailure(onSettleFailureHook);

  console.log('[Payment] Payment lifecycle hooks registered (afterVerify, verifyFailure, beforeSettle, settleFailure)');

  // Register Bazaar discovery extension on t402 server
  try {
    t402Server.registerExtension(bazaarResourceServerExtension as any);
    console.log('[Payment] Bazaar discovery extension registered on t402 server');
  } catch (err: any) {
    console.warn(`[Payment] Bazaar extension on t402 skipped: ${err.message}`);
  }

  await t402Server.initialize();

  // t402 routes accept multiple payment options: USDC on Base Sepolia + USDT on Eth Sepolia
  const t402Routes: Record<string, any> = buildT402Routes(network, ethNetwork, payToAddress);
  t402HttpServer = new t402HTTPResourceServer(t402Server, t402Routes);

  // Register reputation hooks on both servers (fire-and-forget after settlement)
  if (ERC8004_AGENT_ID) {
    const afterSettleHook = async (context: any): Promise<void> => {
      const endpoint = context?.requirements?.resource?.url || context?.requirements?.description || 'unknown';
      const txHash = context?.result?.txHash;
      submitPositiveFeedback(endpoint, txHash).catch(() => {});
    };

    t402Server.onAfterSettle(afterSettleHook);
    x402Server.onAfterSettle(afterSettleHook);
    console.log(`[Payment] ERC-8004 reputation hooks active (agentId: ${ERC8004_AGENT_ID})`);
  }

  console.log('[Payment] x402 server (exact/USDC) + t402 server (exact/USDC + exact-legacy/USDT) ready');

  // --- Dual-protocol middleware ---
  middlewareInstance = async (request, reply) => {
    const adapter = buildAdapter(request);
    const path = request.url.split('?')[0];
    const method = request.method;

    // Dynamic pricing: calculate price based on input length
    const query = (request.query || {}) as Record<string, string>;
    const inputText = query.data || query.text || query.code || '';
    const serviceName = path.replace('/services/', '') as keyof typeof SERVICE_PRICES;
    if (serviceName in SERVICE_PRICES) {
      const dynamicPrice = calculateServicePrice(serviceName, inputText.length);
      const priceUsd = dynamicPrice / 1e6;

      // Update x402 compiled route config (regex expects path with leading /)
      const x402Routes = (x402HttpServer as any).compiledRoutes as any[];
      const x402Route = x402Routes.find((r: any) => r.regex.test(path));
      if (x402Route?.config?.accepts) {
        x402Route.config.accepts.price = `$${priceUsd.toFixed(4)}`;
      }

      // Update t402 compiled route config
      const t402Routes = (t402HttpServer as any).compiledRoutes as any[];
      const t402Route = t402Routes.find((r: any) => r.regex.test(path));
      if (t402Route?.config?.accepts) {
        const accepts = Array.isArray(t402Route.config.accepts) ? t402Route.config.accepts : [t402Route.config.accepts];
        for (const a of accepts) {
          if (a.scheme === 'exact' || a.scheme === 'permit2') {
            a.price = `$${priceUsd.toFixed(4)}`;
          } else if (a.scheme === 'exact-legacy' && typeof a.price === 'object') {
            a.price.amount = String(dynamicPrice);
          }
        }
      }
    }

    // Check for payment header
    const paymentHeader = adapter.getHeader('payment-signature') || adapter.getHeader('PAYMENT-SIGNATURE');

    if (!paymentHeader) {
      // No payment: check if route requires payment via x402 (default)
      const x402Result = await x402HttpServer!.processHTTPRequest({ adapter, path, method });

      if (x402Result.type === 'no-payment-required') {
        return; // Route doesn't need payment, continue
      }

      if (x402Result.type === 'payment-error') {
        // This is a 402 response. Add t402 requirements in the body so t402 clients can also pay.
        const res = x402Result.response;
        for (const [key, value] of Object.entries(res.headers || {})) {
          reply.header(key, value as string);
        }

        // Build t402 payment requirements for the body
        let t402Info: any = null;
        try {
          const t402Result = await t402HttpServer!.processHTTPRequest({ adapter, path, method });
          if (t402Result.type === 'payment-error') {
            t402Info = t402Result.response;
            console.log('[Payment] t402 402 response keys:', Object.keys(t402Info || {}));
            if (t402Info?.headers) console.log('[Payment] t402 header keys:', Object.keys(t402Info.headers));
          }
        } catch (e: any) {
          console.warn('[Payment] t402 402 generation failed:', e.message);
        }

        // Send 402 with x402 header (standard) + t402 info in body
        const body: any = typeof res.body === 'object' && res.body ? { ...res.body as any } : {};
        if (t402Info?.headers) {
          // t402 server may use different header casing
          const t402Header = t402Info.headers['PAYMENT-REQUIRED']
            || t402Info.headers['payment-required']
            || t402Info.headers['Payment-Required']
            || Object.values(t402Info.headers).find((v: any) => typeof v === 'string' && v.startsWith('ey'))
            || null;
          body.t402PaymentRequired = t402Header;
        }
        if (t402Info?.body) {
          body.t402Body = t402Info.body;
        }
        body.protocols = ['x402', 't402'];

        return reply.code(res.status).send(body);
      }

      // Should not reach here for unpaid requests, but handle gracefully
      return;
    }

    // Has payment header: detect protocol and route accordingly
    const protocol = detectProtocol(paymentHeader);

    if (protocol === 'x402') {
      const result = await x402HttpServer!.processHTTPRequest({ adapter, path, method, paymentHeader });
      console.log(`[Payment] x402 processHTTPRequest result type: ${result.type}`);
      if (result.type === 'payment-error') {
        const errBody = result.response?.body;
        const errHeaders = result.response?.headers;
        console.log(`[Payment] x402 payment-error status=${result.response?.status}`);
        if (errHeaders?.['PAYMENT-REQUIRED']) {
          try {
            const decoded = JSON.parse(Buffer.from(errHeaders['PAYMENT-REQUIRED'], 'base64').toString('utf-8'));
            console.log(`[Payment] x402 error reason: ${decoded.error}`);
          } catch {}
        }
      }
      return handleProcessResult(request, reply, result, 'x402');
    }

    if (protocol === 't402') {
      const result = await t402HttpServer!.processHTTPRequest({ adapter, path, method, paymentHeader });
      return handleProcessResult(request, reply, result, 't402');
    }

    // Unknown protocol
    return reply.code(400).send({
      success: false,
      error: { code: 'UNKNOWN_PAYMENT_PROTOCOL', message: 'Payment header is not valid x402 or t402' },
      data: null,
    });
  };

  console.log('[Payment] Dual-protocol middleware initialized (x402 + t402)');
  return middlewareInstance;
}

/**
 * Handle the result from either x402 or t402 processHTTPRequest.
 * Both return the same HTTPProcessResult shape.
 */
function handleProcessResult(request: any, reply: any, result: any, protocol: 'x402' | 't402') {
  if (result.type === 'no-payment-required') {
    return;
  }

  if (result.type === 'payment-error') {
    const res = result.response;
    for (const [key, value] of Object.entries(res.headers || {})) {
      reply.header(key, value as string);
    }
    return reply.code(res.status).send(res.body);
  }

  if (result.type === 'payment-verified') {
    // Store payment data + protocol for settlement routing
    request.paymentPayload = result.paymentPayload;
    request.paymentRequirements = result.paymentRequirements;
    request.paymentProtocol = protocol;
    // x402 has declaredExtensions, t402 does not
    if (result.declaredExtensions) {
      request.paymentDeclaredExtensions = result.declaredExtensions;
    }
    return;
  }
}

export interface SettlementResult {
  settled: boolean;
  txHash?: string;
  payer?: string;
  protocol?: string;
  token?: string;
  chain?: string;
}

/**
 * Settle a verified payment after the service handler succeeds.
 * Routes to the correct HTTPResourceServer based on the protocol detected during verification.
 * Returns settlement data including txHash and payer address for record-keeping.
 */
export async function settlePayment(request: any, reply: any): Promise<SettlementResult> {
  const { paymentPayload, paymentRequirements, paymentProtocol } = request;

  if (!paymentPayload || !paymentRequirements) {
    return { settled: false };
  }

  // Derive token and chain from the accepted payment option
  const acceptedScheme = paymentPayload?.accepted?.scheme;
  const acceptedNetwork = paymentPayload?.accepted?.network || paymentRequirements?.network;
  const isLegacy = acceptedScheme === 'exact-legacy';
  const paymentToken = isLegacy ? 'USDT' : 'USDC';
  const paymentChain = acceptedNetwork || 'eip155:84532';

  try {
    let result: any;

    if (paymentProtocol === 't402' && t402HttpServer) {
      result = await t402HttpServer.processSettlement(paymentPayload, paymentRequirements);
    } else if (x402HttpServer) {
      result = await x402HttpServer.processSettlement(
        paymentPayload,
        paymentRequirements,
        request.paymentDeclaredExtensions,
      );
    } else {
      console.error('[Payment] No HTTP server available for settlement');
      return { settled: false, protocol: paymentProtocol };
    }

    if (result.success) {
      for (const [key, value] of Object.entries(result.headers || {})) {
        reply.header(key, value as string);
      }
      console.log(`[Payment] Settlement successful via ${paymentProtocol || 'x402'} (${paymentToken} on ${paymentChain}) tx=${result.transaction}`);
      return {
        settled: true,
        txHash: result.transaction || undefined,
        payer: result.payer || undefined,
        protocol: paymentProtocol || 'x402',
        token: paymentToken,
        chain: paymentChain,
      };
    } else {
      console.error(`[Payment] Settlement failed via ${paymentProtocol || 'x402'}:`, result.errorReason);
      return {
        settled: false,
        txHash: result.transaction || undefined,
        payer: result.payer || undefined,
        protocol: paymentProtocol || 'x402',
        token: paymentToken,
        chain: paymentChain,
      };
    }
  } catch (error) {
    console.error('[Payment] Settlement error:', error);
    return { settled: false, protocol: paymentProtocol, token: 'USDC', chain: 'eip155:84532' };
  }
}

/**
 * Build x402 route config (Base Sepolia USDC only).
 */
function buildRoutes(scheme: string, network: string, payTo: string): Record<string, any> {
  const buildX402Route = (priceKey: keyof typeof SERVICE_PRICES, description: string, endpoint: string) => {
    const route: any = {
      accepts: { scheme, price: `$${(SERVICE_PRICES[priceKey] / 1e6).toFixed(4)}`, network, payTo },
      description,
      mimeType: 'application/json',
    };
    const discovery = getDiscoveryExtension(endpoint);
    if (discovery) {
      route.extensions = { ...discovery };
    }
    return route;
  };

  return {
    'GET /services/analyze': buildX402Route('analyze', 'AI-powered data analysis', '/services/analyze'),
    'GET /services/summarize': buildX402Route('summarize', 'AI text summarization', '/services/summarize'),
    'GET /services/review': buildX402Route('review', 'AI code review', '/services/review'),
    'GET /services/yield-oracle': buildX402Route('yield-oracle', 'Live on-chain DeFi yield rates (Aave, Compound, Morpho)', '/services/yield-oracle'),
    'GET /services/price-feed': buildX402Route('price-feed', 'Real-time crypto price feed (Bitfinex)', '/services/price-feed'),
    'GET /services/swap-quote': buildX402Route('swap-quote', 'DEX swap quote via Velora aggregator', '/services/swap-quote'),
    'GET /services/market-intel': buildX402Route('market-intel', 'AI-enhanced DeFi market intelligence brief', '/services/market-intel'),
    'GET /services/price-history': buildX402Route('price-history', 'Historical crypto price data with trend analysis (Bitfinex)', '/services/price-history'),
  };
}

/**
 * Build t402 route config with multiple payment options per route:
 * - exact (USDC) on Base Sepolia
 * - exact-legacy (USDT) on Eth Sepolia
 */
function buildT402Routes(baseNetwork: string, ethNetwork: string, payTo: string): Record<string, any> {
  const buildAccepts = (priceUsd: number) => [
    {
      scheme: 'exact',
      price: `$${priceUsd.toFixed(4)}`,
      network: baseNetwork,
      payTo,
    },
    {
      scheme: 'exact-legacy',
      price: { asset: USDT_ETH_SEPOLIA, amount: String(Math.round(priceUsd * 1e6)) },
      network: ethNetwork,
      payTo,
    },
    {
      scheme: 'permit2',
      price: `$${priceUsd.toFixed(4)}`,
      network: baseNetwork,
      payTo,
    },
  ];

  // Validate Bazaar discovery extensions
  validateAllDiscovery();

  // Include ERC-8004 extension if agent is registered
  const extensions: Record<string, any> = {};
  if (ERC8004_AGENT_ID) {
    extensions.erc8004 = buildERC8004Extension(Number(ERC8004_AGENT_ID), payTo);
  }

  const buildRoute = (priceUsd: number, description: string, endpoint: string) => {
    // Merge base extensions with per-endpoint discovery + payment-id + siwx
    const routeExtensions = { ...extensions };
    const discovery = getDiscoveryExtension(endpoint);
    if (discovery) {
      // Spread bazaar extension directly (declareDiscoveryExtension returns { bazaar: {...} })
      Object.assign(routeExtensions, discovery);
    }

    // Payment ID: unique per-request for idempotency and audit
    const paymentIdExt = declarePaymentIdExtension({
      metadata: { endpoint, service: 'survival-agent' },
    });
    routeExtensions[PAYMENT_ID_EXTENSION_KEY] = paymentIdExt;

    // SIWx: require wallet-based identity proof (CAIP-122)
    const siwxExt = declareSIWxExtension({
      resourceUri: `http://localhost:3700${endpoint}`,
      network: baseNetwork as `${string}:${string}`,
      statement: `Authenticate to Forage for ${description}`,
    });
    routeExtensions[SIWX_EXTENSION_KEY] = siwxExt;

    // EIP-2612 Gas Sponsoring: offer gasless permit-based payments
    const gasSponsorExt = declareEip2612GasSponsorExtension({
      sponsoredNetworks: [baseNetwork, ethNetwork],
      maxAmount: String(Math.round(priceUsd * 2 * 1e6)), // 2x price as max
      sponsorAddress: payTo,
    });
    routeExtensions[EIP2612_GAS_SPONSOR_EXTENSION_KEY] = gasSponsorExt;

    // ERC-20 Approval Gas Sponsoring: fallback for tokens without EIP-2612 permit support
    const erc20ApprovalExt = declareERC20ApprovalGasSponsorExtension({
      sponsoredNetworks: [baseNetwork, ethNetwork],
      maxAmount: String(Math.round(priceUsd * 2 * 1e6)),
      sponsorAddress: payTo,
    });
    routeExtensions[ERC20_APPROVAL_GAS_SPONSOR_EXTENSION_KEY] = erc20ApprovalExt;

    return {
      accepts: buildAccepts(priceUsd),
      description,
      mimeType: 'application/json',
      ...(Object.keys(routeExtensions).length > 0 ? { extensions: routeExtensions } : {}),
    };
  };

  return {
    'GET /services/analyze': buildRoute(SERVICE_PRICES.analyze / 1e6, 'AI-powered data analysis', '/services/analyze'),
    'GET /services/summarize': buildRoute(SERVICE_PRICES.summarize / 1e6, 'AI text summarization', '/services/summarize'),
    'GET /services/review': buildRoute(SERVICE_PRICES.review / 1e6, 'AI code review', '/services/review'),
    'GET /services/yield-oracle': buildRoute(SERVICE_PRICES['yield-oracle'] / 1e6, 'Live on-chain DeFi yield rates (Aave, Compound, Morpho)', '/services/yield-oracle'),
    'GET /services/price-feed': buildRoute(SERVICE_PRICES['price-feed'] / 1e6, 'Real-time crypto price feed (Bitfinex)', '/services/price-feed'),
    'GET /services/swap-quote': buildRoute(SERVICE_PRICES['swap-quote'] / 1e6, 'DEX swap quote via Velora aggregator', '/services/swap-quote'),
    'GET /services/market-intel': buildRoute(SERVICE_PRICES['market-intel'] / 1e6, 'AI-enhanced DeFi market intelligence brief', '/services/market-intel'),
    'GET /services/price-history': buildRoute(SERVICE_PRICES['price-history'] / 1e6, 'Historical crypto price data with trend analysis (Bitfinex)', '/services/price-history'),
  };
}

/**
 * Build Fastify-to-HTTP adapter for request processing.
 */
function buildAdapter(request: any) {
  // t402 Zod schema requires resource.url to be a full URL (not relative path)
  const host = request.headers.host || 'localhost:3700';
  const protocol = request.headers['x-forwarded-proto'] || 'http';
  const fullUrl = `${protocol}://${host}${request.url}`;

  return {
    getHeader: (name: string) => {
      const val = request.headers[name.toLowerCase()];
      return Array.isArray(val) ? val[0] : val;
    },
    getMethod: () => request.method,
    getUrl: () => fullUrl,
    getPath: () => request.url.split('?')[0],
    getAcceptHeader: () => request.headers.accept || '*/*',
    getUserAgent: () => request.headers['user-agent'] || '',
  };
}

export function getX402HTTPResourceServer(): InstanceType<typeof x402HTTPResourceServer> | null {
  return x402HttpServer;
}

export function getT402HTTPResourceServer(): InstanceType<typeof t402HTTPResourceServer> | null {
  return t402HttpServer;
}
