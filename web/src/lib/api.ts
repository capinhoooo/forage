const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3700';

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || 'API error');
  return json.data as T;
}

// --- Service Types ---

export type AIServiceType = 'analyze' | 'summarize' | 'review'
export type DefiServiceType = 'yield-oracle' | 'price-feed' | 'swap-quote' | 'market-intel' | 'price-history'
export type ServiceType = AIServiceType | DefiServiceType

export type ServiceParams = {
  input?: string
  from?: string
  to?: string
  tokenIn?: string
  tokenOut?: string
  amount?: string
  days?: string
  tokens?: string
}

export function buildServiceQuery(service: ServiceType, params: ServiceParams): string {
  switch (service) {
    case 'analyze':
      return `data=${encodeURIComponent(params.input || '')}`
    case 'summarize':
      return `text=${encodeURIComponent(params.input || '')}`
    case 'review':
      return `code=${encodeURIComponent(params.input || '')}&language=typescript`
    case 'yield-oracle':
      return ''
    case 'price-feed': {
      let q = `from=${encodeURIComponent(params.from || '')}`
      if (params.to) q += `&to=${encodeURIComponent(params.to)}`
      return q
    }
    case 'swap-quote':
      return `tokenIn=${encodeURIComponent(params.tokenIn || '')}&tokenOut=${encodeURIComponent(params.tokenOut || '')}&amount=${encodeURIComponent(params.amount || '')}`
    case 'market-intel':
      return params.tokens ? `tokens=${encodeURIComponent(params.tokens)}` : ''
    case 'price-history': {
      let q = `from=${encodeURIComponent(params.from || '')}`
      if (params.to) q += `&to=${encodeURIComponent(params.to)}`
      if (params.days) q += `&days=${params.days}`
      return q
    }
  }
}

// --- Types ---

export interface AgentStatus {
  state: string;
  walletAddress: string;
  yieldWalletAddress: string;
  chain: string;
  yieldChain: string;
  balanceUsdc: string;
  balanceUsdt: string;
  balanceEth: string;
  monthlyBurn: string;
  runway: number;
  lifeMeter: number;
  yieldPositions: YieldPosition[];
  totalYieldSupplied: string;
  currentRates: Rate[];
  todayEarnings: string;
  todayCosts: string;
  todayRequests: number;
  totalEarned: string;
  totalRequests: number;
  uptimeSeconds: number;
  isDead: boolean;
  identity: {
    agentId: number;
    registryId: string;
    identityRegistry: string;
    reputationRegistry: string;
  } | null;
  reputation: {
    score: number;
    feedbackCount: number;
    summaryValue: string;
  } | null;
  stateConfig: {
    color: string;
    description: string;
    llmModel: string;
    priceMultiplier: number;
  };
  explorerUrl: string;
  sparkAddress?: string;
  sparkBalance?: string;
  wdkModules?: string[];
  security?: {
    seedEncryption: boolean;
    maxTxAmount: string;
    dailySpendLimit: string;
    killSwitch: boolean;
    yieldRiskThreshold: number;
  };
}

export interface YieldPosition {
  protocol: string;
  chain: string;
  supplied: string;
  riskScore: number;
  token?: string;
}

export interface Rate {
  protocol: string;
  chain: string;
  apy: number;
  riskAdjustedApy: number;
}

export interface Transaction {
  id: string;
  type: string;
  amount: string;
  token: string;
  chain: string;
  txHash: string | null;
  description: string;
  metadata: string | null;
  createdAt: string;
}

export interface PnlData {
  period: string;
  revenue: string;
  costs: string;
  net: string;
  costBreakdown: Record<string, string>;
  dataPoints: {
    timestamp: string;
    revenue: string;
    costs: string;
  }[];
}

export interface ServiceInfo {
  name: string;
  price: string;
  requestCount: number;
  totalRevenue: string;
  totalLlmCost: string;
}

export interface AgentStateSnapshot {
  id: string;
  state: string;
  balanceUsdc: string;
  balanceUsdt: string;
  balanceEth: string;
  monthlyBurn: string;
  runway: number;
  aaveSupplied: string;
  aaveApy: number;
  totalEarned: string;
  totalSpent: string;
  requestsServed: number;
  uptimeSeconds: number;
  chain: string;
  walletAddress: string;
  createdAt: string;
}

export interface ServiceCallResult {
  status: number;
  paid: boolean;
  paymentRequired?: {
    price: string;
    network: string;
    payTo: string;
    protocols: string[];
  };
  data?: any;
}

export interface BazaarCatalog {
  agent: {
    name: string;
    description: string;
    agentId: string | null;
    protocols: string[];
  };
  services: {
    endpoint: string;
    priceUsdc: string;
    discovery: any;
  }[];
  capabilities: {
    paymentExtensions: string[];
    chains: string[];
    schemes: string[];
  };
}

export interface AgentDecision {
  id: string
  action: string
  reasoning: string
  details: Record<string, unknown> | null
  yieldRouter: string | null
  llmCost: string
  timestamp: string
}

export interface SparkInfo {
  address: string
  balanceSats: string
  balanceBtc: string
  network: string
  canReceiveLightning: boolean
  features: string[]
}

// --- Fetchers ---

export const fetchBazaar = () => fetchApi<BazaarCatalog>('/.well-known/t402/discovery');
export const fetchStatus = () => fetchApi<AgentStatus>('/agent/status');
export const fetchHistory = () => fetchApi<Transaction[]>('/agent/history');
export const fetchPnl = (period = '24h') => fetchApi<PnlData>(`/agent/pnl?period=${period}`);
export const fetchServices = () => fetchApi<{ services: ServiceInfo[] }>('/agent/services');
export const fetchStates = (limit = 50) => fetchApi<AgentStateSnapshot[]>(`/agent/states?limit=${limit}`);
export const fetchDecisions = () => fetchApi<AgentDecision[]>('/agent/decisions?limit=10');
export const fetchSpark = () => fetchApi<SparkInfo>('/agent/spark');

/**
 * Call a paid service endpoint. Returns the 402 payment details
 * or (if somehow payment is not required) the actual result.
 */
export async function callService(
  service: ServiceType,
  params: ServiceParams,
): Promise<ServiceCallResult> {
  const query = buildServiceQuery(service, params);
  const url = query
    ? `${API_BASE}/services/${service}?${query}`
    : `${API_BASE}/services/${service}`;

  const res = await fetch(url);

  if (res.status === 402) {
    const body = await res.json().catch(() => ({}));
    const paymentHeader = res.headers.get('payment-required');

    let paymentInfo: any = {};
    if (paymentHeader) {
      try {
        paymentInfo = JSON.parse(atob(paymentHeader));
      } catch { /* ignore */ }
    }

    const accepts = paymentInfo?.accepts?.[0] || {};

    let t402Accepts: any = {};
    if (body?.t402PaymentRequired) {
      try {
        const t402Info = JSON.parse(atob(body.t402PaymentRequired));
        t402Accepts = t402Info?.accepts?.[0] || {};
      } catch { /* ignore */ }
    }

    const price = accepts?.amount || t402Accepts?.amount || 'unknown';
    const priceFormatted = price !== 'unknown' ? `$${(Number(price) / 1e6).toFixed(4)}` : 'unknown';

    return {
      status: 402,
      paid: false,
      paymentRequired: {
        price: priceFormatted,
        network: accepts?.network || t402Accepts?.network || 'unknown',
        payTo: accepts?.payTo || t402Accepts?.payTo || 'unknown',
        protocols: body?.protocols || ['x402'],
      },
    };
  }

  const json = await res.json();
  return {
    status: res.status,
    paid: true,
    data: json.data,
  };
}
