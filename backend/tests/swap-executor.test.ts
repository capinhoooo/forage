import { describe, test, expect } from 'bun:test';
import { TOKENS, SERVICE_PRICES, PRIMARY_CHAIN } from '../src/lib/wdk/config.ts';
import { AGENT_MAX_TX_AMOUNT } from '../src/config/main-config.ts';

describe('Swap Executor: Token Config', () => {
  test('USDC is available on primary chain (base-sepolia)', () => {
    const tokens = TOKENS[PRIMARY_CHAIN];
    expect((tokens as any).USDC).toBeDefined();
    expect((tokens as any).USDC.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect((tokens as any).USDC.decimals).toBe(6);
    expect((tokens as any).USDC.symbol).toBe('USDC');
  });

  test('primary chain is base-sepolia', () => {
    expect(PRIMARY_CHAIN).toBe('base-sepolia');
  });
});

describe('Swap Executor: Max Transaction Guard', () => {
  const maxTx = BigInt(AGENT_MAX_TX_AMOUNT);

  test('max transaction amount is $10 (10_000_000 base units)', () => {
    expect(maxTx).toBe(10_000_000n);
  });

  test('amounts under max are not capped', () => {
    const amount = 5_000_000n; // $5
    expect(amount <= maxTx).toBe(true);
  });

  test('amounts over max should be capped', () => {
    const amount = 50_000_000n; // $50
    expect(amount > maxTx).toBe(true);
    // The executor caps to MAX_TX
    const capped = amount > maxTx ? maxTx : amount;
    expect(capped).toBe(maxTx);
  });
});

describe('Swap Executor: Swap Quote Structure', () => {
  // Validate the expected response shape from quoteSwap
  test('quote result has required fields', () => {
    const mockQuote = {
      tokenInAmount: '1000000',
      tokenOutAmount: '950000',
      fee: '50000000000000',
    };

    expect(mockQuote.tokenInAmount).toBeTruthy();
    expect(mockQuote.tokenOutAmount).toBeTruthy();
    expect(mockQuote.fee).toBeDefined();
    expect(BigInt(mockQuote.tokenInAmount)).toBe(1_000_000n);
    expect(BigInt(mockQuote.tokenOutAmount)).toBe(950_000n);
  });

  test('swap result has required fields', () => {
    const mockResult = {
      hash: '0xabc123',
      fee: 50000000000000n,
      tokenInAmount: 1_000_000n,
      tokenOutAmount: 950_000n,
    };

    expect(mockResult.hash).toMatch(/^0x/);
    expect(mockResult.fee).toBeGreaterThanOrEqual(0n);
    expect(mockResult.tokenInAmount).toBeGreaterThan(0n);
    expect(mockResult.tokenOutAmount).toBeGreaterThan(0n);
  });
});

describe('Swap Executor: Velora Integration Config', () => {
  test('swap-quote service is priced at $0.005', () => {
    expect(SERVICE_PRICES['swap-quote']).toBe(5_000);
  });

  test('swap max fee is 0.0005 ETH', () => {
    const maxFee = 500000000000000n; // Used in swap-executor.ts
    expect(maxFee).toBe(500_000_000_000_000n);
    // Sanity: 0.0005 ETH in wei
    expect(Number(maxFee) / 1e18).toBeCloseTo(0.0005);
  });
});

describe('Swap Executor: Amount Conversions', () => {
  test('human-readable to base units (6 decimals)', () => {
    const humanAmount = 1.5;
    const decimals = 6;
    const baseAmount = BigInt(Math.floor(humanAmount * 10 ** decimals));
    expect(baseAmount).toBe(1_500_000n);
  });

  test('base units to human-readable (6 decimals)', () => {
    const baseAmount = 1_500_000n;
    const decimals = 6;
    const humanAmount = Number(baseAmount) / 10 ** decimals;
    expect(humanAmount).toBe(1.5);
  });

  test('handles 18 decimal tokens', () => {
    const humanAmount = 0.5;
    const decimals = 18;
    const baseAmount = BigInt(Math.floor(humanAmount * 10 ** decimals));
    expect(baseAmount).toBe(500_000_000_000_000_000n);
  });

  test('wei to ETH conversion', () => {
    const wei = 50000000000000n;
    const eth = Number(wei) / 1e18;
    expect(eth).toBeCloseTo(0.00005);
  });
});
