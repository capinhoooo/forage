import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { baseSepolia } from 'wagmi/chains'

export const wagmiConfig = getDefaultConfig({
  appName: 'Forage',
  // WalletConnect Cloud project ID. Get one at https://cloud.walletconnect.com
  // For demo/hackathon: injected wallets (MetaMask) work without this
  projectId: process.env.VITE_WALLETCONNECT_PROJECT_ID || 'demo',
  chains: [baseSepolia],
  ssr: true,
})
