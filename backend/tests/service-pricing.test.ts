import { describe, test, expect } from 'bun:test';
import { SERVICE_PRICES, calculateServicePrice } from '../src/lib/wdk/config.ts';

describe('Service Pricing: Base Prices', () => {
  test('all 8 services have defined prices', () => {
    const services = ['analyze', 'summarize', 'review', 'yield-oracle', 'price-feed', 'swap-quote', 'market-intel', 'price-history'];
    for (const service of services) {
      expect(SERVICE_PRICES[service as keyof typeof SERVICE_PRICES]).toBeDefined();
      expect(SERVICE_PRICES[service as keyof typeof SERVICE_PRICES]).toBeGreaterThan(0);
    }
  });

  test('price-history is $0.01 (10000 base units)', () => {
    expect(SERVICE_PRICES['price-history']).toBe(10_000);
  });

  test('analyze base is $0.05 (50000 base units)', () => {
    expect(SERVICE_PRICES['analyze']).toBe(50_000);
  });

  test('review is the most expensive AI service', () => {
    expect(SERVICE_PRICES['review']).toBeGreaterThan(SERVICE_PRICES['analyze']);
    expect(SERVICE_PRICES['review']).toBeGreaterThan(SERVICE_PRICES['summarize']);
  });
});

describe('Service Pricing: Dynamic Pricing', () => {
  test('flat-rate services ignore input length', () => {
    expect(calculateServicePrice('yield-oracle', 0)).toBe(SERVICE_PRICES['yield-oracle']);
    expect(calculateServicePrice('yield-oracle', 10000)).toBe(SERVICE_PRICES['yield-oracle']);
    expect(calculateServicePrice('price-feed', 500)).toBe(SERVICE_PRICES['price-feed']);
    expect(calculateServicePrice('price-history', 100)).toBe(SERVICE_PRICES['price-history']);
  });

  test('analyze returns base price for short input', () => {
    expect(calculateServicePrice('analyze', 100)).toBe(SERVICE_PRICES['analyze']);
    expect(calculateServicePrice('analyze', 200)).toBe(SERVICE_PRICES['analyze']);
  });

  test('analyze scales above 200 char threshold', () => {
    const price = calculateServicePrice('analyze', 300);
    // 100 extra chars * 15 per char = 1500 extra
    expect(price).toBe(50_000 + 1500);
  });

  test('summarize scales above 300 char threshold', () => {
    const price = calculateServicePrice('summarize', 500);
    // 200 extra chars * 8 per char = 1600 extra
    expect(price).toBe(20_000 + 1600);
  });

  test('review scales above 500 char threshold', () => {
    const price = calculateServicePrice('review', 1000);
    // 500 extra chars * 25 per char = 12500 extra
    expect(price).toBe(100_000 + 12500);
  });

  test('very large input produces high price', () => {
    const price = calculateServicePrice('review', 10000);
    // 9500 extra chars * 25 = 237500 extra
    expect(price).toBe(100_000 + 237_500);
    expect(price).toBeGreaterThan(SERVICE_PRICES['review'] * 2);
  });
});
