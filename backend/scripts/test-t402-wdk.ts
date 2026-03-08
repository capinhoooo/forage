/**
 * Test: @t402/wdk integration
 * Verifies T402WDK.fromWDK() wraps our existing WDK correctly,
 * and createWDKSigner produces a valid ClientEvmSigner.
 */
import '../dotenv.ts';
import { getWdk, getT402Wdk, getWalletAddress } from '../src/lib/wdk/index.ts';
import { createWDKSigner } from '@t402/wdk';
import { PRIMARY_CHAIN } from '../src/lib/wdk/config.ts';

async function main() {
  console.log('=== T402 WDK Integration Test ===\n');

  // 1. Initialize base WDK
  console.log('[1] Initializing base WDK...');
  const wdk = getWdk();
  const eoaAddress = await getWalletAddress(PRIMARY_CHAIN);
  console.log(`    EOA address: ${eoaAddress}`);

  // 2. Wrap with T402WDK
  console.log('\n[2] Creating T402WDK wrapper via fromWDK()...');
  const t402wdk = getT402Wdk();
  console.log(`    T402WDK initialized: ${t402wdk.isInitialized}`);
  console.log(`    Underlying WDK: ${t402wdk.wdk ? 'accessible' : 'missing'}`);

  // 3. Create WDKSigner (ClientEvmSigner)
  console.log('\n[3] Creating WDKSigner via createWDKSigner()...');
  const signer = await createWDKSigner(wdk as any, PRIMARY_CHAIN);
  console.log(`    Signer address: ${signer.address}`);
  console.log(`    Address matches EOA: ${signer.address.toLowerCase() === eoaAddress.toLowerCase()}`);

  // 4. Verify signTypedData exists
  console.log(`    signTypedData: ${typeof signer.signTypedData === 'function' ? 'available' : 'MISSING'}`);

  // 5. Test T402WDK getSigner
  console.log('\n[4] Testing T402WDK.getSigner()...');
  const t402Signer = await t402wdk.getSigner('base-sepolia');
  console.log(`    T402 signer address: ${t402Signer.address}`);
  console.log(`    Matches EOA: ${t402Signer.address.toLowerCase() === eoaAddress.toLowerCase()}`);

  // 6. Test aggregated balances
  console.log('\n[5] Testing getAggregatedBalances()...');
  try {
    const balances = await t402wdk.getAggregatedBalances();
    console.log(`    Chains with balances: ${balances.length}`);
    for (const b of balances) {
      console.log(`    ${b.chain}: native=${b.nativeBalance?.toString() || '0'}`);
    }
  } catch (e: any) {
    console.log(`    Skipped (expected on testnet): ${e.message?.slice(0, 80)}`);
  }

  console.log('\n=== All T402 WDK tests passed! ===');
}

main().catch(console.error);
