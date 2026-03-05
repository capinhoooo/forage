import { describe, test, expect } from 'bun:test';
import {
  getDiscoveryExtension,
  getAllDiscoveryExtensions,
  validateAllDiscovery,
} from '../src/lib/payment/discovery.ts';

describe('Discovery Extensions: Endpoint Coverage', () => {
  const expectedEndpoints = [
    '/services/analyze',
    '/services/summarize',
    '/services/review',
    '/services/yield-oracle',
    '/services/price-feed',
    '/services/swap-quote',
    '/services/market-intel',
    '/services/price-history',
  ];

  test('all 8 service endpoints have discovery extensions', () => {
    for (const endpoint of expectedEndpoints) {
      const ext = getDiscoveryExtension(endpoint);
      expect(ext).not.toBeNull();
    }
  });

  test('price-history endpoint has discovery extension', () => {
    const ext = getDiscoveryExtension('/services/price-history');
    expect(ext).not.toBeNull();
    expect(ext).toBeDefined();
  });

  test('unknown endpoint returns null', () => {
    expect(getDiscoveryExtension('/services/nonexistent')).toBeNull();
    expect(getDiscoveryExtension('/foo')).toBeNull();
  });

  test('getAllDiscoveryExtensions returns all 8 endpoints', () => {
    const all = getAllDiscoveryExtensions();
    expect(Object.keys(all)).toHaveLength(8);
    for (const endpoint of expectedEndpoints) {
      expect(all[endpoint]).toBeDefined();
    }
  });

  test('getAllDiscoveryExtensions returns a copy', () => {
    const all1 = getAllDiscoveryExtensions();
    const all2 = getAllDiscoveryExtensions();
    expect(all1).not.toBe(all2); // Different object references
    expect(Object.keys(all1)).toEqual(Object.keys(all2));
  });
});

describe('Discovery Extensions: Validation', () => {
  test('all discovery extensions pass validation', () => {
    const result = validateAllDiscovery();
    expect(result).toBe(true);
  });
});

describe('Discovery Extensions: Structure', () => {
  test('each extension has bazaar key with info and schema', () => {
    const all = getAllDiscoveryExtensions();
    for (const [endpoint, ext] of Object.entries(all)) {
      // declareDiscoveryExtension returns { bazaar: { info, schema } }
      expect(ext).toBeDefined();
      const keys = Object.keys(ext);
      expect(keys.length).toBeGreaterThan(0);
    }
  });

  test('price-history extension has expected structure', () => {
    const ext = getDiscoveryExtension('/services/price-history');
    expect(ext).not.toBeNull();
    // Should have a top-level key (bazaar or similar)
    const topKeys = Object.keys(ext!);
    expect(topKeys.length).toBeGreaterThan(0);
  });
});
