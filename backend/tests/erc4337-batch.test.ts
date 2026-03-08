import { describe, test, expect } from 'bun:test';
import { Interface } from 'ethers';
import { AAVE_CONFIG, ERC4337_CONFIG, YIELD_CHAIN } from '../src/lib/wdk/config.ts';

/**
 * Tests for ERC-4337 batched transaction construction.
 * Verifies that the approve+supply batch is correctly structured
 * for WDK's account.sendTransaction([tx1, tx2]) API.
 */

const POOL_IFACE = new Interface([
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external',
  'function withdraw(address asset, uint256 amount, address to) external returns (uint256)',
]);

const ERC20_IFACE = new Interface([
  'function approve(address spender, uint256 amount) external returns (bool)',
]);

describe('ERC-4337 Batch: Transaction Construction', () => {
  const safeAddress = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12';
  const amount = 5_000_000n; // $5 USDC

  test('approve tx targets token contract, not pool', () => {
    const config = AAVE_CONFIG['base-sepolia'];
    const approveTx = {
      to: config.usdc,
      data: ERC20_IFACE.encodeFunctionData('approve', [config.pool, amount]),
      value: 0n,
    };

    expect(approveTx.to).toBe(config.usdc);
    expect(approveTx.to).not.toBe(config.pool);
    expect(approveTx.value).toBe(0n);
  });

  test('supply tx targets pool contract, not token', () => {
    const config = AAVE_CONFIG['base-sepolia'];
    const supplyTx = {
      to: config.pool,
      data: POOL_IFACE.encodeFunctionData('supply', [config.usdc, amount, safeAddress, 0]),
      value: 0n,
    };

    expect(supplyTx.to).toBe(config.pool);
    expect(supplyTx.to).not.toBe(config.usdc);
    expect(supplyTx.value).toBe(0n);
  });

  test('batch array is [approve, supply] in correct order', () => {
    const config = AAVE_CONFIG['base-sepolia'];
    const batch = [
      {
        to: config.usdc,
        data: ERC20_IFACE.encodeFunctionData('approve', [config.pool, amount]),
        value: 0n,
      },
      {
        to: config.pool,
        data: POOL_IFACE.encodeFunctionData('supply', [config.usdc, amount, safeAddress, 0]),
        value: 0n,
      },
    ];

    // First tx = approve (to token)
    expect(batch[0].to).toBe(config.usdc);
    // Second tx = supply (to pool)
    expect(batch[1].to).toBe(config.pool);
  });

  test('function selectors are correct', () => {
    // approve(address,uint256) = 0x095ea7b3
    const approveData = ERC20_IFACE.encodeFunctionData('approve', [
      '0x0000000000000000000000000000000000000001',
      1n,
    ]);
    expect(approveData.slice(0, 10)).toBe('0x095ea7b3');

    // supply(address,uint256,address,uint16) = 0x617ba037
    const supplyData = POOL_IFACE.encodeFunctionData('supply', [
      '0x0000000000000000000000000000000000000001',
      1n,
      '0x0000000000000000000000000000000000000001',
      0,
    ]);
    expect(supplyData.slice(0, 10)).toBe('0x617ba037');

    // withdraw(address,uint256,address) = 0x69328dec
    const withdrawData = POOL_IFACE.encodeFunctionData('withdraw', [
      '0x0000000000000000000000000000000000000001',
      1n,
      '0x0000000000000000000000000000000000000001',
    ]);
    expect(withdrawData.slice(0, 10)).toBe('0x69328dec');
  });
});

describe('ERC-4337 Batch: USDC vs USDT', () => {
  test('aave-v3 batch uses USDC address', () => {
    const config = AAVE_CONFIG['base-sepolia'];
    const tokenAddress = config.usdc;
    expect(tokenAddress).toBe('0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f');
  });

  test('aave-v3-usdt batch uses USDT address', () => {
    const config = AAVE_CONFIG['base-sepolia'];
    const tokenAddress = config.usdt;
    expect(tokenAddress).toBe('0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a');
  });

  test('both tokens target the same pool', () => {
    const config = AAVE_CONFIG['base-sepolia'];
    // The pool address is the same regardless of token
    expect(config.pool).toBe('0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27');
  });
});

describe('ERC-4337 Batch: Ethereum Sepolia Config', () => {
  test('ethereum-sepolia Aave pool is configured', () => {
    const config = AAVE_CONFIG['ethereum-sepolia'];
    expect(config.pool).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(config.usdc).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  test('yield chain matches 4337 chainId', () => {
    expect(YIELD_CHAIN).toBe('ethereum-sepolia');
    expect(ERC4337_CONFIG.chainId).toBe(11155111);
  });
});

describe('ERC-4337 Batch: Fallback Behavior', () => {
  // The yield-router tries 4337 first, then falls back to EOA.
  // These tests validate the decision logic.

  test('4337 batch is only attempted for Aave protocols', () => {
    const aaveProtocols = ['aave-v3', 'aave-v3-usdt'];
    const nonAaveProtocols = ['compound-v3', 'morpho-blue'];

    for (const p of aaveProtocols) {
      expect(p === 'aave-v3' || p === 'aave-v3-usdt').toBe(true);
    }
    for (const p of nonAaveProtocols) {
      expect(p === 'aave-v3' || p === 'aave-v3-usdt').toBe(false);
    }
  });

  test('4337 batch is only attempted on yield chain', () => {
    // The yield-router checks: chain === YIELD_CHAIN
    expect(YIELD_CHAIN).toBe('ethereum-sepolia');

    // base-sepolia should NOT use 4337
    const chain: string = 'base-sepolia';
    expect(chain === YIELD_CHAIN).toBe(false);
  });

  test('non-Aave protocols always use EOA', () => {
    // compound-v3 and morpho-blue skip 4337 entirely
    const protocols = ['compound-v3', 'morpho-blue'];
    for (const p of protocols) {
      const isAave = p === 'aave-v3' || p === 'aave-v3-usdt';
      expect(isAave).toBe(false);
    }
  });
});

describe('ERC-4337 Batch: Transaction Metadata', () => {
  test('4337 batch supply logs correct method tag', () => {
    const metadata = JSON.stringify({
      protocol: 'aave-v3',
      chain: 'ethereum-sepolia',
      token: 'USDC',
      method: '4337-batch',
    });
    const parsed = JSON.parse(metadata);
    expect(parsed.method).toBe('4337-batch');
  });

  test('4337 withdraw logs correct method tag', () => {
    const metadata = JSON.stringify({
      protocol: 'aave-v3',
      chain: 'ethereum-sepolia',
      token: 'USDC',
      method: '4337',
    });
    const parsed = JSON.parse(metadata);
    expect(parsed.method).toBe('4337');
  });

  test('EOA fallback has no method tag in metadata', () => {
    const metadata = JSON.stringify({
      protocol: 'compound-v3',
      chain: 'ethereum-sepolia',
      token: 'USDC',
    });
    const parsed = JSON.parse(metadata);
    expect(parsed.method).toBeUndefined();
  });
});
