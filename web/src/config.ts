interface AppConfig {
  appName: string
  appDescription: string
  links: {
    github: string
  }
  features: {
    smoothScroll: boolean
  }
}

export const config: AppConfig = {
  appName: 'Forage',
  appDescription: 'Autonomous AI agent that earns to survive via x402 micropayments and DeFi yield.',

  links: {
    github: '',
  },

  features: {
    smoothScroll: true,
  },
}

export type Config = AppConfig
