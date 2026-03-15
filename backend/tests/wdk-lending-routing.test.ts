import { describe, test, expect } from 'bun:test';

describe('WDK Lending Routing: Tool Registration', () => {
  test('custom-tools module exports registerCustomTools', async () => {
    const mod = await import('../src/lib/mcp/custom-tools.ts');
    expect(typeof mod.registerCustomTools).toBe('function');
  });

  test('yield-optimizer exports supplyToAave and withdrawFromAave', async () => {
    const mod = await import('../src/lib/agent/yield-optimizer.ts');
    expect(typeof mod.supplyToAave).toBe('function');
    expect(typeof mod.withdrawFromAave).toBe('function');
    expect(typeof mod.getAaveSuppliedBalance).toBe('function');
    expect(typeof mod.getAavePositions).toBe('function');
  });

  test('MCP index exports getMcpClient', async () => {
    const mod = await import('../src/lib/mcp/index.ts');
    expect(typeof mod.getMcpClient).toBe('function');
    // Before init, client should be null
    expect(mod.getMcpClient()).toBeNull();
  });
});

describe('WDK Lending Routing: Aave Config', () => {
  test('Aave V3 config exists for base-sepolia', async () => {
    const { AAVE_CONFIG, isAaveAvailable } = await import('../src/lib/wdk/config.ts');
    expect(isAaveAvailable('base-sepolia')).toBe(true);
    expect(AAVE_CONFIG['base-sepolia'].pool).toBe('0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27');
    expect(AAVE_CONFIG['base-sepolia'].usdc).toBe('0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f');
  });

  test('Aave V3 config exists for ethereum-sepolia', async () => {
    const { AAVE_CONFIG, isAaveAvailable } = await import('../src/lib/wdk/config.ts');
    expect(isAaveAvailable('ethereum-sepolia')).toBe(true);
    expect(AAVE_CONFIG['ethereum-sepolia'].pool).toBeTruthy();
  });

  test('Aave not available on spark chain', async () => {
    const { isAaveAvailable } = await import('../src/lib/wdk/config.ts');
    expect(isAaveAvailable('spark')).toBe(false);
  });
});
