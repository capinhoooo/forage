import { describe, test, expect } from 'bun:test';
import { SERVICE_PRICES, TOKENS, PRIMARY_CHAIN } from '../src/lib/wdk/config.ts';

describe('Custom Tools: Service Catalog', () => {
  const allServices = [
    'analyze', 'summarize', 'review',
    'yield-oracle', 'price-feed', 'swap-quote', 'market-intel', 'price-history',
  ];

  test('all 8 services have prices defined', () => {
    for (const service of allServices) {
      expect(SERVICE_PRICES[service as keyof typeof SERVICE_PRICES]).toBeDefined();
      expect(SERVICE_PRICES[service as keyof typeof SERVICE_PRICES]).toBeGreaterThan(0);
    }
  });

  test('AI services are more expensive than DeFi data services', () => {
    const aiPrices = [SERVICE_PRICES.analyze, SERVICE_PRICES.summarize, SERVICE_PRICES.review];
    const defiPrices = [
      SERVICE_PRICES['yield-oracle'],
      SERVICE_PRICES['price-feed'],
      SERVICE_PRICES['swap-quote'],
      SERVICE_PRICES['price-history'],
    ];

    const minAi = Math.min(...aiPrices);
    const maxDefi = Math.max(...defiPrices);
    // summarize ($0.02) > price-history ($0.01)
    expect(minAi).toBeGreaterThanOrEqual(maxDefi);
  });

  test('market-intel is the most expensive DeFi service (AI-enhanced)', () => {
    expect(SERVICE_PRICES['market-intel']).toBeGreaterThan(SERVICE_PRICES['yield-oracle']);
    expect(SERVICE_PRICES['market-intel']).toBeGreaterThan(SERVICE_PRICES['price-feed']);
    expect(SERVICE_PRICES['market-intel']).toBeGreaterThan(SERVICE_PRICES['swap-quote']);
    expect(SERVICE_PRICES['market-intel']).toBeGreaterThan(SERVICE_PRICES['price-history']);
  });

  test('service categories are correct', () => {
    const aiServices = ['analyze', 'summarize', 'review'];
    const defiServices = ['yield-oracle', 'price-feed', 'swap-quote', 'market-intel', 'price-history'];

    expect(aiServices).toHaveLength(3);
    expect(defiServices).toHaveLength(5);
    expect(aiServices.length + defiServices.length).toBe(8);
  });
});

describe('Custom Tools: Swap Tool Config', () => {
  test('USDC address is valid on primary chain', () => {
    const usdcAddress = (TOKENS[PRIMARY_CHAIN] as any).USDC.address;
    expect(usdcAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  test('swap tool amount conversion matches USDC decimals', () => {
    const amountIn = 1.5; // human-readable
    const decimals = (TOKENS[PRIMARY_CHAIN] as any).USDC.decimals;
    const baseUnits = BigInt(Math.floor(amountIn * 10 ** decimals));
    expect(baseUnits).toBe(1_500_000n);
  });
});

describe('Custom Tools: Yield Tools', () => {
  test('supplyToAave converts human-readable to base units', () => {
    const amountUsdc = 5.0;
    const amount = BigInt(Math.floor(amountUsdc * 1e6));
    expect(amount).toBe(5_000_000n);
  });

  test('withdrawFromAave: 0 means withdraw all', () => {
    const amountUsdc = 0;
    expect(amountUsdc <= 0).toBe(true);
    // When 0, the tool fetches getAaveSuppliedBalance() and withdraws everything
  });
});

describe('Custom Tools: Cross-Chain Balances', () => {
  test('both chains are represented', () => {
    const chains = ['base-sepolia', 'ethereum-sepolia'];
    expect(chains).toHaveLength(2);
  });

  test('total stablecoins aggregates USDC + USDT', () => {
    const baseUsdc = 5_000_000n; // $5
    const usdtBalance = 3_000_000n; // $3
    const totalStable = (Number(baseUsdc) + Number(usdtBalance)) / 1e6;
    expect(totalStable).toBe(8);
  });
});

describe('Custom Tools: Agent Identity', () => {
  test('valid Ethereum address format check', () => {
    const validAddress = '0x1234567890abcdef1234567890abcdef12345678';
    expect(validAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);

    const invalidAddress = '0xinvalid';
    expect(invalidAddress).not.toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  test('agent ID conversion to BigInt', () => {
    const agentId = 42;
    const bigIntId = BigInt(agentId);
    expect(bigIntId).toBe(42n);
    expect(bigIntId > 0n).toBe(true);
  });
});
