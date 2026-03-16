import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'

import HeroUIProvider from '../providers/HeroUIProvider'
import WalletProvider from '../providers/WalletProvider'
import ErrorPage from '../components/ErrorPage'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  errorComponent: ({ error, reset }) => <ErrorPage error={error} reset={reset} />,
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Forage Dashboard' },
      { name: 'description', content: 'Autonomous AI agent that earns USDC via x402 micropayments, invests in DeFi for yield, and dies if its balance hits zero.' },
      { name: 'theme-color', content: '#f7f7f5' },
      { property: 'og:title', content: 'Forage: The AI That Must Earn to Live' },
      { property: 'og:description', content: 'Autonomous AI agent with WDK wallet. Earns via x402 micropayments, invests surplus across Aave, Compound, and Morpho for yield.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: 'Forage Dashboard' },
      { name: 'twitter:description', content: 'The AI agent that must earn to live. Built for Hackathon Galactica.' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/assets/Forage.svg' },
      { rel: 'apple-touch-icon', href: '/assets/Forage.svg' },
    ],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootComponent() {
  return (
    <HeroUIProvider>
      <WalletProvider>
        <Outlet />
      </WalletProvider>
    </HeroUIProvider>
  )
}
