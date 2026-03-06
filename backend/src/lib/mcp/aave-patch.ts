/**
 * Monkey-patch the WDK Aave V3 address map to include Base Sepolia.
 *
 * The WDK's @tetherto/wdk-protocol-lending-aave-evm only imports mainnet
 * chain addresses from @bgd-labs/aave-address-book. Base Sepolia (84532)
 * is available in the library but not imported.
 *
 * Strategy: Override the _getAddressMap method on the AaveProtocolEvm
 * prototype to inject Base Sepolia addresses before the original lookup.
 *
 * Addresses verified from @bgd-labs/aave-address-book AaveV3BaseSepolia.
 */
import AaveProtocolEvm from '@tetherto/wdk-protocol-lending-aave-evm';

const BASE_SEPOLIA_CHAIN_ID = 84532n;

const BASE_SEPOLIA_AAVE = {
  pool: '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27',
  uiPoolDataProvider: '0x6a9D64f93DB660EaCB2b6E9424792c630CdA87d8',
  poolAddressesProvider: '0xE4C23309117Aa30342BFaae6c95c6478e0A4Ad00',
  priceOracle: '0x943b0dE18d4abf4eF02A85912F8fc07684C141dF',
};

let patched = false;

/**
 * Patch AaveProtocolEvm to support Base Sepolia.
 * Overrides _getAddressMap to inject testnet addresses.
 * Safe to call multiple times (idempotent).
 */
export async function patchAaveAddressMap(): Promise<void> {
  if (patched) return;

  const originalGetAddressMap = (AaveProtocolEvm.prototype as any)._getAddressMap;

  (AaveProtocolEvm.prototype as any)._getAddressMap = async function () {
    if (!this._addressMap) {
      const { chainId } = await this._provider.getNetwork();

      if (chainId === BASE_SEPOLIA_CHAIN_ID) {
        this._chainId = chainId;
        this._addressMap = BASE_SEPOLIA_AAVE;
        return this._addressMap;
      }
    }

    // Fall through to original for other chains
    return originalGetAddressMap.call(this);
  };

  patched = true;
  console.log('[Aave Patch] AaveProtocolEvm patched for Base Sepolia (84532)');
}
