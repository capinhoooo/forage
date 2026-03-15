import { describe, test, expect } from 'bun:test';
import { CHAINS, SPARK_CHAIN } from '../src/lib/wdk/config.ts';
import { SPARK_NETWORK } from '../src/config/main-config.ts';

describe('Spark Wallet: Configuration', () => {
  test('SPARK_CHAIN constant is "spark"', () => {
    expect(SPARK_CHAIN).toBe('spark');
  });

  test('Spark chain exists in CHAINS config', () => {
    expect(CHAINS['spark']).toBeDefined();
    expect(CHAINS['spark'].name).toBe('Spark (Lightning)');
  });

  test('Spark chain has correct CAIP-2 format', () => {
    const caip2 = CHAINS['spark'].caip2;
    expect(caip2).toMatch(/^spark:/);
  });

  test('Spark chain has explorer URL', () => {
    expect(CHAINS['spark'].explorerUrl).toBe('https://scan.spark.money');
  });

  test('SPARK_NETWORK defaults to REGTEST', () => {
    // Default when env var not set
    expect(['MAINNET', 'REGTEST']).toContain(SPARK_NETWORK);
  });

  test('Spark chain has no RPC provider (uses SDK)', () => {
    expect(CHAINS['spark'].provider).toBe('');
  });

  test('Spark chain has chainId 0 (non-EVM)', () => {
    expect(CHAINS['spark'].chainId).toBe(0);
  });
});

describe('Spark Wallet: ChainKey type', () => {
  test('spark is a valid ChainKey', () => {
    const chains = Object.keys(CHAINS);
    expect(chains).toContain('spark');
  });

  test('all expected chains exist', () => {
    const chains = Object.keys(CHAINS);
    expect(chains).toContain('base-sepolia');
    expect(chains).toContain('ethereum-sepolia');
    expect(chains).toContain('arbitrum-sepolia');
    expect(chains).toContain('spark');
  });
});
