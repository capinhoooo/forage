import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { useState, useRef, useEffect } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useWalletClient } from 'wagmi'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import {
  fetchStatus, fetchHistory, fetchPnl, fetchServices, fetchStates, fetchBazaar, callService,
  fetchDecisions, fetchSpark,
  type AgentStatus, type Transaction, type PnlData, type ServiceInfo, type ServiceCallResult,
  type ServiceType, type ServiceParams, type BazaarCatalog, type AgentDecision, type SparkInfo,
} from '@/lib/api'
import { createBrowserPaymentFetch, type PaymentToken } from '@/lib/x402-browser'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function dollar(raw: string | undefined, decimals = 2): string {
  if (!raw) return '$0.00'
  return `$${(Number(raw) / 1e6).toFixed(decimals)}`
}

function formatUptime(seconds: number | undefined): string {
  if (!seconds) return '0m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const fadeUp = {
  initial: { opacity: 0, y: 4, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
}

function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial="initial"
      animate="animate"
      transition={{ staggerChildren: 0.04 }}
    >
      {children}
    </motion.div>
  )
}

function FadeIn({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={fadeUp}>
      {children}
    </motion.div>
  )
}

function Dashboard() {
  const status = useQuery({
    queryKey: ['agent-status'],
    queryFn: fetchStatus,
    refetchInterval: 15000,
  })

  const history = useQuery({
    queryKey: ['agent-history'],
    queryFn: fetchHistory,
    refetchInterval: 30000,
  })

  const pnl = useQuery({
    queryKey: ['agent-pnl'],
    queryFn: () => fetchPnl('24h'),
    refetchInterval: 60000,
  })

  const services = useQuery({
    queryKey: ['agent-services'],
    queryFn: fetchServices,
    refetchInterval: 30000,
  })

  const decisions = useQuery({
    queryKey: ['agent-decisions'],
    queryFn: fetchDecisions,
    refetchInterval: 30000,
  })

  const spark = useQuery({
    queryKey: ['agent-spark'],
    queryFn: fetchSpark,
    refetchInterval: 60000,
  })

  if (status.isLoading) {
    return (
      <div className="min-h-screen" style={{ background: '#f7f7f5' }}>
        <div className="max-w-[960px] mx-auto px-6 py-12">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <div className="skeleton" style={{ width: 120, height: 20, marginBottom: '1.5rem' }} />
            <div className="skeleton" style={{ width: '100%', height: 14, borderRadius: 999, marginBottom: '1rem' }} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px" style={{ borderRadius: 12, overflow: 'hidden', marginBottom: '2rem' }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{ padding: '1rem', background: '#fff' }}>
                  <div className="skeleton" style={{ width: 60, height: 12, marginBottom: 8 }} />
                  <div className="skeleton" style={{ width: 80, height: 20 }} />
                </div>
              ))}
            </div>
            <p style={{ color: 'rgba(0,0,0,0.35)', fontSize: '0.875rem', textAlign: 'center' }}>Connecting to Forage...</p>
          </motion.div>
        </div>
      </div>
    )
  }

  if (status.error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f7f7f5' }}>
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          <p style={{ color: '#1a1a1a', fontWeight: 600 }}>Agent offline</p>
          <p style={{ color: 'rgba(0,0,0,0.4)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Waiting for the agent to come online...
          </p>
          <motion.button
            onClick={() => status.refetch()}
            whileTap={{ scale: 0.97 }}
            style={{
              marginTop: '1rem', padding: '0.5rem 1.25rem', borderRadius: 999,
              background: '#1a1a1a', color: '#fff', fontSize: '0.8125rem', fontWeight: 500,
              border: 'none', cursor: 'pointer',
            }}
          >
            Retry
          </motion.button>
        </motion.div>
      </div>
    )
  }

  const s = status.data!

  return (
    <div className="min-h-screen" style={{ background: '#f7f7f5', color: '#1a1a1a' }}>
      <div className="max-w-[960px] mx-auto px-6 py-12">
        <Stagger>
          <FadeIn><AgentHeader status={s} /></FadeIn>
          <FadeIn><HowItWorks /></FadeIn>
          <FadeIn><LifeMeter status={s} /></FadeIn>
          <FadeIn><DecisionLog decisions={decisions.data} /></FadeIn>
          <FadeIn><StatsGrid status={s} pnl={pnl.data} /></FadeIn>
          <FadeIn><WalletOverview status={s} spark={spark.data} /></FadeIn>
          <FadeIn><EarningsChart /></FadeIn>
          <FadeIn><PnlChart /></FadeIn>
          <FadeIn><StateTimeline /></FadeIn>
          <FadeIn><ServicesCatalog services={services.data?.services} /></FadeIn>
          <FadeIn><TryService /></FadeIn>
          <FadeIn><YieldPositions status={s} /></FadeIn>
          <FadeIn><CurrentRates status={s} /></FadeIn>
          <FadeIn><BazaarDiscovery /></FadeIn>
          <FadeIn><WdkEcosystem status={s} /></FadeIn>
          <FadeIn><RecentActivity transactions={history.data} explorerUrl={s.explorerUrl} /></FadeIn>
          <FadeIn><Footer status={s} /></FadeIn>
        </Stagger>
      </div>
    </div>
  )
}

// --- Sections ---

function AgentHeader({ status }: { status: AgentStatus }) {
  const stateColors: Record<string, string> = {
    THRIVING: '#22c55e',
    STABLE: '#84cc16',
    CAUTIOUS: '#eab308',
    DESPERATE: '#f97316',
    CRITICAL: '#ef4444',
    DEAD: '#1f2937',
  }
  const color = stateColors[status.state] || '#1a1a1a'

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <img src="/assets/Forage.svg" alt="Forage" style={{ height: '2.25rem' }} />
            <motion.span
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.125rem 0.625rem',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 600,
                background: `${color}14`,
                color: color,
              }}
            >
              {status.state}
            </motion.span>
          </div>
          <p style={{ fontSize: '0.875rem', color: 'rgba(0,0,0,0.4)' }}>
            {shortAddr(status.walletAddress)} on {status.chain} · uptime {formatUptime(status.uptimeSeconds)}
            {status.identity && ` · ERC-8004 #${status.identity.agentId}`}
          </p>
        </div>
        <ConnectButton.Custom>
          {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
            const connected = mounted && account && chain
            return (
              <div {...(!mounted && { 'aria-hidden': true, style: { opacity: 0, pointerEvents: 'none' as const, userSelect: 'none' as const } })}>
                {!connected ? (
                  <button
                    onClick={openConnectModal}
                    style={{
                      padding: '0.375rem 0.875rem',
                      borderRadius: '8px',
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      border: '1px solid rgba(0,0,0,0.1)',
                      background: '#ffffff',
                      color: '#1a1a1a',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Connect wallet
                  </button>
                ) : chain.unsupported ? (
                  <button
                    onClick={openChainModal}
                    style={{
                      padding: '0.375rem 0.875rem',
                      borderRadius: '8px',
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      border: '1px solid #ef4444',
                      background: '#fef2f2',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Switch network
                  </button>
                ) : (
                  <button
                    onClick={openAccountModal}
                    style={{
                      padding: '0.375rem 0.875rem',
                      borderRadius: '8px',
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      border: '1px solid rgba(0,0,0,0.1)',
                      background: '#ffffff',
                      color: '#1a1a1a',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {account.displayName}
                  </button>
                )}
              </div>
            )
          }}
        </ConnectButton.Custom>
      </div>
    </div>
  )
}

function HowItWorks() {
  const [open, setOpen] = useState(false)

  const steps = [
    { title: 'Earn', text: '8 AI and DeFi services behind x402/t402 paywalls. Clients pay USDC or USDT per request.' },
    { title: 'Think', text: 'Claude AI evaluates financial state every few minutes and decides: supply yield, withdraw, swap tokens, or hold.' },
    { title: 'Invest', text: 'Surplus funds are deployed across Aave V3, Compound V3, and Morpho Blue for yield. 4337 Smart Account batches approve+supply atomically.' },
    { title: 'Survive', text: 'If the balance drops, the agent enters DESPERATE mode: withdraws yield, cuts costs, lowers prices. At zero, it dies.' },
  ]

  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontSize: '0.8125rem',
          color: 'rgba(0,0,0,0.4)',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: '0.625rem', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms ease' }}>&#9654;</span>
        How does this agent work?
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ marginTop: '0.75rem' }}>
              {steps.map((s, i) => (
                <div key={s.title} style={{
                  padding: '0.875rem',
                  background: '#ffffff',
                  borderRadius: '10px',
                  border: '1px solid rgba(0,0,0,0.06)',
                }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem', color: '#22c55e' }}>
                    {i + 1}. {s.title}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.5)', lineHeight: 1.5 }}>
                    {s.text}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function LifeMeter({ status }: { status: AgentStatus }) {
  const pct = Math.min(100, Math.max(0, status.lifeMeter))
  const isCritical = status.state === 'CRITICAL'
  const isDesperate = status.state === 'DESPERATE'
  const isDead = status.state === 'DEAD'
  const isThriving = status.state === 'THRIVING'

  const barColor = pct > 60 ? '#22c55e' : pct > 30 ? '#eab308' : '#ef4444'
  const pulseClass = isCritical ? 'pulse-critical' : isDesperate ? 'pulse-desperate' : ''
  const heartbeatClass = isCritical ? 'heartbeat-fast' : 'heartbeat'

  const barBg = isThriving
    ? `linear-gradient(90deg, #22c55e, #4ade80, #22c55e)`
    : (isCritical || isDesperate)
      ? `linear-gradient(90deg, ${barColor}, ${barColor}cc)`
      : barColor

  return (
    <div className="mb-8">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {!isDead && (
          <span
            className={heartbeatClass}
            style={{
              display: 'inline-block',
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: barColor,
              flexShrink: 0,
            }}
          />
        )}
        {isDead && (
          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#9ca3af', flexShrink: 0 }} />
        )}
        <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Life meter</h2>
        <span style={{
          fontSize: '0.6875rem',
          fontWeight: 600,
          padding: '0.125rem 0.5rem',
          borderRadius: '9999px',
          background: `${barColor}15`,
          color: barColor,
        }}>
          {status.state}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)', borderRadius: '999px', height: '0.875rem' }}>
          <motion.div
            className={`${pulseClass} ${isThriving ? 'shimmer-bar' : ''}`}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            style={{
              height: '100%',
              background: barBg,
              borderRadius: '999px',
              color: barColor,
              boxShadow: pct > 0 ? `0 0 ${isCritical ? 16 : isDesperate ? 10 : 6}px ${barColor}40` : 'none',
            }}
          />
        </div>
        <motion.span
          key={pct.toFixed(0)}
          initial={{ scale: 1.15, opacity: 0.7 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          style={{
            fontSize: '0.9375rem',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: barColor,
            minWidth: '3.5rem',
            textAlign: 'right',
          }}
        >
          {pct.toFixed(0)}%
        </motion.span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
        <p style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.4)', margin: 0 }}>
          {status.stateConfig?.description}
        </p>
        <p style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.3)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
          {status.runway.toFixed(1)}mo runway
        </p>
      </div>
    </div>
  )
}

function StatsGrid({ status, pnl }: { status: AgentStatus; pnl?: PnlData }) {
  const totalValue = (Number(status.balanceUsdc) + Number(status.balanceUsdt) + Number(status.totalYieldSupplied)) / 1e6

  const stats = [
    { label: 'Total value', value: `$${totalValue.toFixed(2)}` },
    { label: 'USDC balance', value: dollar(status.balanceUsdc) },
    { label: 'USDT balance', value: dollar(status.balanceUsdt) },
    { label: 'Yield supplied', value: dollar(status.totalYieldSupplied) },
    { label: 'Runway', value: `${status.runway.toFixed(1)}mo` },
    { label: 'Monthly burn', value: dollar(status.monthlyBurn) },
    {
      label: 'Today P&L',
      value: pnl ? dollar(pnl.net) : '...',
      valueColor: pnl && Number(pnl.net) >= 0 ? '#22c55e' : '#ef4444',
    },
    { label: 'Total earned', value: dollar(status.totalEarned) },
  ]

  return (
    <div className="mb-8">
      <SectionHeading title="Financials" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px" style={{ background: 'rgba(0,0,0,0.06)', borderRadius: '12px', overflow: 'hidden' }}>
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.03, ease: [0.16, 1, 0.3, 1] }}
          >
            <StatCard label={s.label} value={s.value} valueColor={s.valueColor} />
          </motion.div>
        ))}
      </div>
    </div>
  )
}

// --- Earnings Chart (recharts) ---

function EarningsChart() {
  const states = useQuery({
    queryKey: ['earnings-chart'],
    queryFn: () => fetchStates(100),
    refetchInterval: 30000,
  })

  const snapshots = [...(states.data || [])].reverse()
  const data = snapshots.map(s => ({
    time: new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    earned: Number(s.totalEarned) / 1e6,
  }))

  if (data.length < 2) return null

  return (
    <div className="mb-8">
      <SectionHeading title="Total earned" />
      <div style={{ background: '#ffffff', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(0,0,0,0.06)' }}>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="fillEarned" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.3)' }}
              axisLine={{ stroke: 'rgba(0,0,0,0.06)' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.3)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v.toFixed(2)}`}
              width={50}
              domain={['dataMin - 0.01', 'dataMax + 0.01']}
            />
            <Tooltip
              contentStyle={{
                background: '#ffffff',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: '8px',
                fontSize: '0.75rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              }}
              formatter={(value) => [`$${Number(value).toFixed(4)}`, 'Earned']}
            />
            <Area type="monotone" dataKey="earned" stroke="#22c55e" fill="url(#fillEarned)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// --- P&L Chart ---

function PnlChart() {
  const [period, setPeriod] = useState<'1h' | '24h' | '7d' | '30d'>('24h')
  const pnl = useQuery({
    queryKey: ['agent-pnl-chart', period],
    queryFn: () => fetchPnl(period),
    refetchInterval: 60000,
  })

  const dataPoints = pnl.data?.dataPoints || []
  const totalRevenue = dataPoints.reduce((s, dp) => s + Number(dp.revenue), 0) / 1e6
  const totalCosts = dataPoints.reduce((s, dp) => s + Number(dp.costs), 0) / 1e6
  const netPnl = totalRevenue - totalCosts
  // Find max value across all bars for scaling
  const maxBar = Math.max(...dataPoints.map(dp => Math.max(Number(dp.revenue), Number(dp.costs))), 1)

  const periods = ['1h', '24h', '7d', '30d'] as const

  return (
    <div className="mb-8">
      <SectionHeading title="P&L" />
      <div className="flex items-center gap-2 mb-3">
        {periods.map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              padding: '0.25rem 0.625rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 500,
              border: '1px solid',
              borderColor: period === p ? '#1a1a1a' : 'rgba(0,0,0,0.08)',
              background: period === p ? '#1a1a1a' : 'transparent',
              color: period === p ? '#f7f7f5' : 'rgba(0,0,0,0.4)',
              cursor: 'pointer',
              transition: 'all 120ms ease-out',
            }}
          >
            {p}
          </button>
        ))}
        {pnl.data && (
          <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'rgba(0,0,0,0.3)', fontVariantNumeric: 'tabular-nums' }}>
            net: <span style={{ color: Number(pnl.data.net) >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{dollar(pnl.data.net, 4)}</span>
          </span>
        )}
      </div>
      {dataPoints.length > 0 ? (
        <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 0.5rem 0' }}>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={dataPoints.map(dp => {
                const d = new Date(dp.timestamp)
                return {
                  time: period === '7d' || period === '30d'
                    ? d.toLocaleDateString([], { month: 'short', day: 'numeric' })
                    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  revenue: Number(dp.revenue) / 1e6,
                  costs: Number(dp.costs) / 1e6,
                }
              })} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="pnlRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="pnlCostGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.25)' }} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(dataPoints.length / 8) - 1)} />
                <YAxis tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.25)' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(2)}`} />
                <Tooltip contentStyle={{ fontSize: '0.75rem', borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }} formatter={(v: number) => [`$${v.toFixed(4)}`, '']} />
                <Area type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={1.5} fill="url(#pnlRevGrad)" name="Revenue" />
                <Area type="monotone" dataKey="costs" stroke="#ef4444" strokeWidth={1.5} fill="url(#pnlCostGrad)" name="Costs" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {/* Summary footer */}
          <div style={{ padding: '0.625rem 1rem', borderTop: '1px solid rgba(0,0,0,0.04)', display: 'flex', gap: '1.5rem', fontSize: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '2px', background: '#22c55e', display: 'inline-block' }} />
              <span style={{ color: 'rgba(0,0,0,0.5)' }}>Revenue</span>
              <span style={{ fontWeight: 600, color: '#22c55e', fontVariantNumeric: 'tabular-nums' }}>${totalRevenue.toFixed(4)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '2px', background: '#ef4444', opacity: 0.7, display: 'inline-block' }} />
              <span style={{ color: 'rgba(0,0,0,0.5)' }}>Costs</span>
              <span style={{ fontWeight: 600, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>${totalCosts.toFixed(4)}</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span style={{ color: 'rgba(0,0,0,0.5)' }}>Net</span>
              <span style={{ fontWeight: 600, color: netPnl >= 0 ? '#22c55e' : '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{netPnl >= 0 ? '+' : '-'}${Math.abs(netPnl).toFixed(4)}</span>
            </div>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: '0.875rem', color: 'rgba(0,0,0,0.3)' }}>
          {pnl.isLoading ? 'Loading chart...' : 'No data for this period'}
        </p>
      )}
    </div>
  )
}

// --- State Timeline ---

const STATE_COLORS: Record<string, string> = {
  THRIVING: '#22c55e',
  STABLE: '#84cc16',
  CAUTIOUS: '#eab308',
  DESPERATE: '#f97316',
  CRITICAL: '#ef4444',
  DEAD: '#1f2937',
}

function StateTimeline() {
  const [showAll, setShowAll] = useState(false)
  const states = useQuery({
    queryKey: ['agent-states'],
    queryFn: () => fetchStates(50),
    refetchInterval: 60000,
  })

  const items = states.data || []
  const visible = showAll ? items : items.slice(0, 10)

  if (items.length === 0) {
    return (
      <div className="mb-8">
        <SectionHeading title="State history" />
        <p style={{ fontSize: '0.875rem', color: 'rgba(0,0,0,0.3)' }}>
          {states.isLoading ? 'Loading...' : 'Waiting for the first agent loop to run...'}
        </p>
      </div>
    )
  }

  return (
    <div className="mb-8">
      <SectionHeading title="State history" />
      <div>
        {visible.map((snap, i) => {
          const color = STATE_COLORS[snap.state] || '#1a1a1a'
          return (
            <motion.div
              key={snap.id}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15, delay: i * 0.02, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-3"
              style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}
            >
              <span style={{
                display: 'inline-flex',
                padding: '0.0625rem 0.4375rem',
                borderRadius: '999px',
                fontSize: '0.6875rem',
                fontWeight: 600,
                background: `${color}14`,
                color: color,
                minWidth: '4.5rem',
                justifyContent: 'center',
              }}>
                {snap.state}
              </span>
              <span style={{ fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                {dollar(snap.balanceUsdc)}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.3)' }}>
                {snap.runway.toFixed(1)}mo runway
              </span>
              <span style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.25)', marginLeft: 'auto' }}>
                {timeAgo(snap.createdAt)}
              </span>
            </motion.div>
          )
        })}
      </div>
      {items.length > 10 && (
        <button
          onClick={() => setShowAll(!showAll)}
          style={{
            marginTop: '0.5rem',
            fontSize: '0.75rem',
            color: 'rgba(0,0,0,0.35)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {showAll ? 'Show less' : `Show all ${items.length} entries`}
        </button>
      )}
    </div>
  )
}

// --- Service Meta ---

interface ServiceInput {
  key: string
  label: string
  placeholder: string
  required?: boolean
}

interface ServiceMetaEntry {
  label: string
  description: string
  category: 'ai' | 'defi'
  inputs: ServiceInput[]
}

const SERVICE_META: Record<string, ServiceMetaEntry> = {
  analyze: {
    label: 'Analyze',
    description: 'AI-powered data analysis',
    category: 'ai',
    inputs: [{ key: 'input', label: 'Data', placeholder: 'Paste data to analyze (JSON, CSV, text...)', required: true }],
  },
  summarize: {
    label: 'Summarize',
    description: 'AI text summarization',
    category: 'ai',
    inputs: [{ key: 'input', label: 'Text', placeholder: 'Paste text to summarize...', required: true }],
  },
  review: {
    label: 'Review',
    description: 'AI code review',
    category: 'ai',
    inputs: [{ key: 'input', label: 'Code', placeholder: 'Paste code to review...', required: true }],
  },
  'yield-oracle': {
    label: 'Yield Oracle',
    description: 'Live on-chain APYs from Aave, Compound, Morpho',
    category: 'defi',
    inputs: [],
  },
  'price-feed': {
    label: 'Price Feed',
    description: 'Real-time asset pricing via Bitfinex',
    category: 'defi',
    inputs: [
      { key: 'from', label: 'Asset', placeholder: 'BTC', required: true },
      { key: 'to', label: 'Quote', placeholder: 'USD' },
    ],
  },
  'swap-quote': {
    label: 'Swap Quote',
    description: 'DEX aggregator quote (read-only)',
    category: 'defi',
    inputs: [
      { key: 'tokenIn', label: 'Token In', placeholder: '', required: true, type: 'select' as const, options: [
        { label: 'USDC (Circle)', value: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' },
        { label: 'USDC (Aave)', value: '0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f' },
        { label: 'WETH', value: '0x4200000000000000000000000000000000000006' },
      ]},
      { key: 'tokenOut', label: 'Token Out', placeholder: '', required: true, type: 'select' as const, options: [
        { label: 'USDC (Circle)', value: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' },
        { label: 'USDC (Aave)', value: '0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f' },
        { label: 'WETH', value: '0x4200000000000000000000000000000000000006' },
      ]},
      { key: 'amount', label: 'Amount', placeholder: '1.0', required: true },
    ],
  },
  'market-intel': {
    label: 'Market Intel',
    description: 'AI-enhanced DeFi market brief',
    category: 'defi',
    inputs: [
      { key: 'tokens', label: 'Tokens', placeholder: 'BTC,ETH (optional)' },
    ],
  },
  'price-history': {
    label: 'Price History',
    description: 'Historical price data with trend analysis',
    category: 'defi',
    inputs: [
      { key: 'from', label: 'Asset', placeholder: 'BTC', required: true },
      { key: 'to', label: 'Quote', placeholder: 'USD' },
      { key: 'days', label: 'Days', placeholder: '7' },
    ],
  },
}

const PRICE_CONFIG: Record<string, { base: number; threshold?: number; perChar?: number }> = {
  analyze:        { base: 50_000,  threshold: 200, perChar: 15 },
  summarize:      { base: 20_000,  threshold: 300, perChar: 8 },
  review:         { base: 100_000, threshold: 500, perChar: 25 },
  'yield-oracle': { base: 10_000 },
  'price-feed':   { base: 5_000 },
  'swap-quote':   { base: 5_000 },
  'market-intel':  { base: 30_000 },
  'price-history': { base: 10_000 },
}

function estimatePrice(service: string, inputLength: number): number {
  const cfg = PRICE_CONFIG[service]
  if (!cfg) return 0
  if (!cfg.threshold || !cfg.perChar || inputLength <= cfg.threshold) return cfg.base
  return cfg.base + Math.ceil((inputLength - cfg.threshold) * cfg.perChar)
}

// --- Services Catalog ---

function ServicesCatalog({ services }: { services?: ServiceInfo[] }) {
  return (
    <div className="mb-8">
      <SectionHeading title="Paid services" />
      <p style={{ fontSize: '0.8125rem', color: 'rgba(0,0,0,0.4)', marginBottom: '1rem', lineHeight: 1.5 }}>
        Pay USDC or USDT per request. Each call goes through x402/t402 payment settlement before the service executes.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(services || []).map((svc, i) => {
          const meta = SERVICE_META[svc.name]
          return (
            <motion.div
              key={svc.name}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              style={{
                background: '#ffffff',
                borderRadius: '12px',
                padding: '1rem',
                border: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                  /{svc.name}
                </span>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                  color: '#22c55e',
                }}>
                  {dollar(svc.price)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mb-2">
                <span style={{
                  fontSize: '0.5625rem',
                  fontWeight: 600,
                  padding: '0.0625rem 0.3125rem',
                  borderRadius: '999px',
                  background: meta?.category === 'ai' ? 'rgba(59,130,246,0.08)' : 'rgba(139,92,246,0.08)',
                  color: meta?.category === 'ai' ? '#1e40af' : '#5b21b6',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}>
                  {meta?.category || 'service'}
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.4)', marginBottom: '0.5rem', lineHeight: 1.4 }}>
                {meta?.description || svc.name}
              </p>
              <div className="flex items-center justify-between" style={{ fontSize: '0.6875rem', color: 'rgba(0,0,0,0.25)' }}>
                <span>{svc.requestCount} req</span>
                <span>{dollar(svc.totalRevenue)}</span>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// --- Try Service ---

const AI_SERVICES: ServiceType[] = ['summarize', 'analyze', 'review']
const DEFI_SERVICES: ServiceType[] = ['yield-oracle', 'price-feed', 'swap-quote', 'market-intel', 'price-history']

function TryService() {
  const [selectedService, setSelectedService] = useState<ServiceType>('summarize')
  const [selectedToken, setSelectedToken] = useState<PaymentToken>('USDC')
  const [params, setParams] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<string>('')
  const [result, setResult] = useState<ServiceCallResult | null>(null)
  const queryClient = useQueryClient()

  const { isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()

  const meta = SERVICE_META[selectedService]
  const isAI = meta?.category === 'ai'
  const inputLength = isAI ? (params.input || '').length : 0

  const updateParam = (key: string, value: string) => {
    setParams(prev => ({ ...prev, [key]: value }))
  }

  const buildParams = (): ServiceParams => {
    const sp: ServiceParams = {}
    for (const inp of meta?.inputs || []) {
      if (params[inp.key]) {
        (sp as any)[inp.key] = params[inp.key]
      }
    }
    return sp
  }

  const handlePreview = async () => {
    if (meta?.inputs.some(inp => inp.required && !(params[inp.key] || '').trim())) return
    setLoading(true)
    setStep('Calling endpoint...')
    setResult(null)
    try {
      const res = await callService(selectedService, buildParams())
      setResult(res)
    } catch (err: any) {
      setResult({ status: 500, paid: false, data: { error: err.message } })
    }
    setLoading(false)
    setStep('')
  }

  const handlePaidCall = async () => {
    if (meta?.inputs.some(inp => inp.required && !(params[inp.key] || '').trim())) return
    if (!walletClient) return
    setLoading(true)
    setResult(null)

    try {
      setStep(selectedToken === 'USDT' ? 'Checking USDT allowance on Eth Sepolia...' : 'Preparing payment...')
      const payFetch = createBrowserPaymentFetch(walletClient)

      setStep(selectedToken === 'USDT' ? 'Check wallet for approval & signature prompts...' : 'Sign the payment in your wallet...')
      const res = await payFetch(selectedService, buildParams(), selectedToken)

      if (res.paid) {
        setResult({ status: res.status, paid: true, data: res.data })
      } else {
        setResult({
          status: res.status === 402 ? 400 : res.status,
          paid: false,
          data: { error: res.error || 'Payment failed' },
        })
      }

      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['agent-history'] })
        queryClient.invalidateQueries({ queryKey: ['agent-status'] })
        queryClient.invalidateQueries({ queryKey: ['agent-services'] })
        queryClient.invalidateQueries({ queryKey: ['agent-pnl'] })
      }, 3000)
    } catch (err: any) {
      const msg = err.message || String(err)
      if (msg.includes('User rejected') || msg.includes('denied')) {
        setResult({ status: 0, paid: false, data: { error: 'Transaction rejected by user' } })
      } else {
        setResult({ status: 500, paid: false, data: { error: msg } })
      }
    }
    setLoading(false)
    setStep('')
  }

  const canSubmit = meta?.inputs.length === 0 || !meta?.inputs.some(inp => inp.required && !(params[inp.key] || '').trim())
  const price = estimatePrice(selectedService, inputLength)

  return (
    <div className="mb-8">
      <SectionHeading title="Try it" />
      <p style={{ fontSize: '0.8125rem', color: 'rgba(0,0,0,0.4)', marginBottom: '1rem', lineHeight: 1.5 }}>
        {isConnected
          ? 'Send a paid request below. Revenue goes straight to the agent\'s wallet.'
          : 'Connect a wallet to pay with USDC or USDT, or preview the 402 response.'
        }
      </p>

      {/* Service selector: AI row + DeFi row */}
      <div className="flex items-center gap-4 mb-2 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {AI_SERVICES.map(svc => (
            <ServicePill
              key={svc}
              service={svc}
              selected={selectedService === svc}
              onClick={() => { setSelectedService(svc); setResult(null); setParams({}) }}
            />
          ))}
          <span style={{ width: '1px', background: 'rgba(0,0,0,0.08)', margin: '0 0.25rem' }} />
          {DEFI_SERVICES.map(svc => (
            <ServicePill
              key={svc}
              service={svc}
              selected={selectedService === svc}
              onClick={() => { setSelectedService(svc); setResult(null); setParams({}) }}
            />
          ))}
        </div>
        {isConnected && (
          <div className="flex items-center gap-1" style={{ marginLeft: 'auto' }}>
            <span style={{ fontSize: '0.6875rem', color: 'rgba(0,0,0,0.3)', marginRight: '0.25rem' }}>pay with</span>
            {(['USDC', 'USDT'] as const).map(token => (
              <button
                key={token}
                onClick={() => setSelectedToken(token)}
                style={{
                  padding: '0.25rem 0.625rem',
                  borderRadius: '999px',
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  border: '1px solid',
                  borderColor: selectedToken === token ? (token === 'USDC' ? '#2563eb' : '#16a34a') : 'rgba(0,0,0,0.08)',
                  background: selectedToken === token ? (token === 'USDC' ? '#2563eb10' : '#16a34a10') : 'transparent',
                  color: selectedToken === token ? (token === 'USDC' ? '#2563eb' : '#16a34a') : 'rgba(0,0,0,0.35)',
                  cursor: 'pointer',
                  transition: 'all 120ms ease-out',
                }}
              >
                {token}
              </button>
            ))}
          </div>
        )}
      </div>
      {selectedToken === 'USDT' && isConnected && (
        <p style={{ fontSize: '0.6875rem', color: 'rgba(0,0,0,0.35)', marginBottom: '0.5rem', lineHeight: 1.5 }}>
          USDT pays via T402 on Ethereum Sepolia. Requires a one-time token approval before payment.
        </p>
      )}

      {/* Dynamic input fields */}
      {meta?.inputs.length > 0 && (
        <div className="mb-3">
          {isAI ? (
            <textarea
              value={params.input || ''}
              onChange={e => updateParam('input', e.target.value)}
              placeholder={meta.inputs[0]?.placeholder}
              rows={3}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid rgba(0,0,0,0.1)',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
                background: 'transparent',
                color: '#1a1a1a',
                resize: 'vertical',
                outline: 'none',
              }}
            />
          ) : (
            <div className="flex gap-2 flex-wrap">
              {meta.inputs.map(inp => (
                <div key={inp.key} style={{ flex: '1 1 auto', minWidth: '100px' }}>
                  <label style={{ fontSize: '0.6875rem', color: 'rgba(0,0,0,0.4)', display: 'block', marginBottom: '0.25rem' }}>
                    {inp.label}{inp.required && ' *'}
                  </label>
                  {(inp as any).type === 'select' ? (
                    <select
                      value={params[inp.key] || ''}
                      onChange={e => updateParam(inp.key, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid rgba(0,0,0,0.1)',
                        fontSize: '0.8125rem',
                        fontFamily: 'inherit',
                        background: '#fff',
                        color: '#1a1a1a',
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="">Select...</option>
                      {((inp as any).options || []).map((opt: { label: string; value: string }) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={params[inp.key] || ''}
                      onChange={e => updateParam(inp.key, e.target.value)}
                      placeholder={inp.placeholder}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid rgba(0,0,0,0.1)',
                        fontSize: '0.8125rem',
                        fontFamily: 'inherit',
                        background: 'transparent',
                        color: '#1a1a1a',
                        outline: 'none',
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Input stats (AI services only) */}
      {isAI && inputLength > 0 && (
        <div className="flex items-center gap-3 mt-1.5 mb-2" style={{ fontSize: '0.6875rem', color: 'rgba(0,0,0,0.3)' }}>
          <span>{inputLength} chars</span>
          <span>·</span>
          <span>estimated cost: ${(price / 1e6).toFixed(4)} {selectedToken}</span>
          {PRICE_CONFIG[selectedService]?.threshold && inputLength > (PRICE_CONFIG[selectedService].threshold || 0) && (
            <>
              <span>·</span>
              <span>base ${(PRICE_CONFIG[selectedService].base / 1e6).toFixed(2)} + length fee</span>
            </>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        {isConnected && walletClient ? (
          <button
            onClick={handlePaidCall}
            disabled={loading || !canSubmit}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 500,
              border: 'none',
              background: '#22c55e',
              color: '#ffffff',
              cursor: loading || !canSubmit ? 'not-allowed' : 'pointer',
              opacity: loading || !canSubmit ? 0.35 : 1,
              transition: 'opacity 100ms ease-out',
            }}
          >
            {loading
              ? step || 'Processing...'
              : `Pay $${(price / 1e6).toFixed(isAI && inputLength > 0 ? 4 : 2)} ${selectedToken} · /${selectedService}`
            }
          </button>
        ) : null}
        <button
          onClick={handlePreview}
          disabled={loading || !canSubmit}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '6px',
            fontSize: '0.875rem',
            fontWeight: 500,
            border: '1px solid rgba(0,0,0,0.08)',
            background: 'transparent',
            color: 'rgba(0,0,0,0.5)',
            cursor: loading || !canSubmit ? 'not-allowed' : 'pointer',
            opacity: loading || !canSubmit ? 0.35 : 1,
            transition: 'opacity 100ms ease-out',
          }}
        >
          {!isConnected ? 'Preview response' : 'Preview 402'}
        </button>
        {!isConnected && (
          <span style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.3)' }}>
            connect wallet to pay
          </span>
        )}
      </div>

      {/* Result */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{
              marginTop: '1rem',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            {result.status === 402 ? (
              <PaymentRequiredResponse result={result} service={selectedService} />
            ) : result.paid ? (
              <ServiceSuccessResponse result={result} service={selectedService} />
            ) : (
              <div style={{ padding: '1rem', background: 'rgba(239,68,68,0.06)', borderRadius: '8px' }}>
                <p style={{ fontSize: '0.875rem', color: '#991b1b', fontWeight: 500 }}>
                  {result.status === 0 ? 'Cancelled' : `Error ${result.status}`}
                </p>
                <pre style={{ fontSize: '0.75rem', color: '#991b1b', marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ServicePill({ service, selected, onClick }: { service: ServiceType; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.3125rem 0.625rem',
        borderRadius: '6px',
        fontSize: '0.75rem',
        fontWeight: 500,
        border: '1px solid',
        borderColor: selected ? '#1a1a1a' : 'rgba(0,0,0,0.08)',
        background: selected ? '#1a1a1a' : 'transparent',
        color: selected ? '#f7f7f5' : 'rgba(0,0,0,0.5)',
        cursor: 'pointer',
        transition: 'all 120ms ease-out',
        whiteSpace: 'nowrap',
      }}
    >
      /{service}
    </button>
  )
}

function PaymentRequiredResponse({ result, service }: { result: ServiceCallResult; service: string }) {
  const pr = result.paymentRequired
  return (
    <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(245,158,11,0.1)' }}>
        <div className="flex items-center gap-2">
          <span style={{
            display: 'inline-flex',
            padding: '0.125rem 0.5rem',
            borderRadius: '999px',
            fontSize: '0.6875rem',
            fontWeight: 600,
            background: 'rgba(245,158,11,0.12)',
            color: '#92400e',
          }}>
            402
          </span>
          <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#92400e' }}>
            Payment Required
          </span>
        </div>
        <p style={{ fontSize: '0.8125rem', color: '#92400e', marginTop: '0.5rem', opacity: 0.7 }}>
          To use /services/{service}, pay the amount below via x402 or t402 protocol.
        </p>
      </div>
      {pr && (
        <div style={{ padding: '1rem 1.25rem' }}>
          <div className="grid grid-cols-2 gap-3" style={{ fontSize: '0.8125rem' }}>
            <div>
              <p style={{ color: 'rgba(0,0,0,0.4)', marginBottom: '0.125rem' }}>Price</p>
              <p style={{ fontWeight: 600, color: '#1a1a1a' }}>{pr.price}</p>
            </div>
            <div>
              <p style={{ color: 'rgba(0,0,0,0.4)', marginBottom: '0.125rem' }}>Network</p>
              <p style={{ fontWeight: 500, color: '#1a1a1a' }}>{pr.network}</p>
            </div>
            <div>
              <p style={{ color: 'rgba(0,0,0,0.4)', marginBottom: '0.125rem' }}>Pay to</p>
              <p style={{ fontWeight: 500, fontFamily: 'monospace', fontSize: '0.75rem', color: '#1a1a1a' }}>{pr.payTo}</p>
            </div>
            <div>
              <p style={{ color: 'rgba(0,0,0,0.4)', marginBottom: '0.125rem' }}>Protocols</p>
              <p style={{ fontWeight: 500, color: '#1a1a1a' }}>{pr.protocols?.join(', ')}</p>
            </div>
          </div>
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(0,0,0,0.03)', borderRadius: '6px' }}>
            <p style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.4)', lineHeight: 1.5 }}>
              Connect your wallet and click the green pay button above. You'll sign a gasless payment authorization, the agent verifies it, settles {pr.price} on-chain, and returns the result.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function Markdown({ text }: { text: string }) {
  if (!text) return null
  const paragraphs = text.split(/\n{2,}/)
  return (
    <>
      {paragraphs.map((block, i) => {
        const trimmed = block.trim()
        if (!trimmed) return null

        const numberedLines = trimmed.split('\n').filter(l => /^\d+[\.\)]\s/.test(l.trim()))
        if (numberedLines.length > 1) {
          return (
            <ol key={i} style={{ paddingLeft: '1.25rem', margin: '0.5rem 0', listStyleType: 'decimal' }}>
              {numberedLines.map((line, j) => (
                <li key={j} style={{ fontSize: '0.8125rem', color: 'rgba(0,0,0,0.7)', lineHeight: 1.7, marginBottom: '0.25rem' }}>
                  <InlineMarkdown text={line.replace(/^\d+[\.\)]\s*/, '')} />
                </li>
              ))}
            </ol>
          )
        }

        const bulletLines = trimmed.split('\n').filter(l => /^[-*]\s/.test(l.trim()))
        if (bulletLines.length > 1) {
          return (
            <ul key={i} style={{ paddingLeft: '1.25rem', margin: '0.5rem 0' }}>
              {bulletLines.map((line, j) => (
                <li key={j} style={{ fontSize: '0.8125rem', color: 'rgba(0,0,0,0.7)', lineHeight: 1.7, marginBottom: '0.25rem' }}>
                  <InlineMarkdown text={line.replace(/^[-*]\s*/, '')} />
                </li>
              ))}
            </ul>
          )
        }

        if (/^#{1,3}\s/.test(trimmed)) {
          const level = trimmed.match(/^(#{1,3})\s/)![1].length
          const headingText = trimmed.replace(/^#{1,3}\s*/, '')
          const sizes = { 1: '0.9375rem', 2: '0.875rem', 3: '0.8125rem' } as Record<number, string>
          return (
            <p key={i} style={{ fontSize: sizes[level] || '0.875rem', fontWeight: 600, color: '#1a1a1a', margin: '0.75rem 0 0.25rem' }}>
              <InlineMarkdown text={headingText} />
            </p>
          )
        }

        return (
          <p key={i} style={{ fontSize: '0.875rem', color: '#1a1a1a', lineHeight: 1.7, margin: '0.5rem 0' }}>
            <InlineMarkdown text={trimmed.replace(/\n/g, ' ')} />
          </p>
        )
      })}
    </>
  )
}

function InlineMarkdown({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*/)
    const boldMatch2 = remaining.match(/^(.*?)__(.+?)__/)
    const match = boldMatch || boldMatch2

    if (match && match.index !== undefined) {
      if (match[1]) parts.push(<span key={key++}>{match[1]}</span>)
      parts.push(<strong key={key++} style={{ fontWeight: 600 }}>{match[2]}</strong>)
      remaining = remaining.slice(match[0].length)
      continue
    }

    const codeMatch = remaining.match(/^(.*?)`(.+?)`/)
    if (codeMatch) {
      if (codeMatch[1]) parts.push(<span key={key++}>{codeMatch[1]}</span>)
      parts.push(
        <code key={key++} style={{
          fontSize: '0.8em',
          padding: '0.125rem 0.375rem',
          borderRadius: '4px',
          background: 'rgba(0,0,0,0.06)',
          fontFamily: 'ui-monospace, monospace',
        }}>
          {codeMatch[2]}
        </code>
      )
      remaining = remaining.slice(codeMatch[0].length)
      continue
    }

    parts.push(<span key={key++}>{remaining}</span>)
    break
  }

  return <>{parts}</>
}

function ServiceSuccessResponse({ result, service }: { result: ServiceCallResult; service: string }) {
  const d = result.data || {}
  const meta = SERVICE_META[service]
  const isDefi = meta?.category === 'defi'

  // AI services: extract main text
  const mainText = d.summary || d.analysis || d.review || d.brief || ''
  const bullets: string[] = d.keyPoints || d.insights || d.suggestions || []

  return (
    <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid rgba(34,197,94,0.1)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span style={{
              display: 'inline-flex',
              padding: '0.125rem 0.5rem',
              borderRadius: '999px',
              fontSize: '0.6875rem',
              fontWeight: 600,
              background: 'rgba(34,197,94,0.12)',
              color: '#166534',
            }}>
              200
            </span>
            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#166534' }}>
              Paid and delivered
            </span>
            {service === 'review' && d.score != null && (
              <span style={{
                display: 'inline-flex',
                padding: '0.125rem 0.5rem',
                borderRadius: '999px',
                fontSize: '0.6875rem',
                fontWeight: 600,
                background: d.score >= 7 ? 'rgba(34,197,94,0.12)' : d.score >= 4 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                color: d.score >= 7 ? '#166534' : d.score >= 4 ? '#92400e' : '#991b1b',
              }}>
                {d.score}/10
              </span>
            )}
          </div>
          {d.toolsUsed?.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap justify-end">
              {d.toolsUsed.map((t: string, i: number) => (
                <span key={i} style={{
                  fontSize: '0.625rem',
                  padding: '0.0625rem 0.375rem',
                  borderRadius: '999px',
                  background: 'rgba(0,0,0,0.05)',
                  color: 'rgba(0,0,0,0.35)',
                }}>
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ padding: '1rem 1.25rem', maxHeight: '400px', overflow: 'auto' }}>
        {isDefi && !mainText ? (
          <pre style={{
            fontSize: '0.8125rem',
            color: '#1a1a1a',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'ui-monospace, monospace',
            margin: 0,
          }}>
            {JSON.stringify(d, null, 2)}
          </pre>
        ) : (
          <>
            <Markdown text={mainText} />
            {bullets.length > 0 && !mainText.includes('1.') && !mainText.includes('- ') && (
              <ul style={{ paddingLeft: '1.25rem', marginTop: '0.75rem' }}>
                {bullets.map((pt: string, i: number) => (
                  <li key={i} style={{ fontSize: '0.8125rem', color: 'rgba(0,0,0,0.6)', lineHeight: 1.7, marginBottom: '0.25rem' }}>
                    <InlineMarkdown text={pt} />
                  </li>
                ))}
              </ul>
            )}
            {isDefi && d && (
              <details style={{ marginTop: '0.75rem' }}>
                <summary style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.35)', cursor: 'pointer' }}>Raw response</summary>
                <pre style={{
                  fontSize: '0.75rem',
                  color: 'rgba(0,0,0,0.5)',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'ui-monospace, monospace',
                  marginTop: '0.5rem',
                }}>
                  {JSON.stringify(d, null, 2)}
                </pre>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function YieldPositions({ status }: { status: AgentStatus }) {
  if (status.yieldPositions.length === 0) {
    return (
      <div className="mb-8">
        <SectionHeading title="Yield positions" />
        <p style={{ fontSize: '0.875rem', color: 'rgba(0,0,0,0.4)' }}>No active positions</p>
      </div>
    )
  }

  return (
    <div className="mb-8">
      <SectionHeading title="Yield positions" />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Protocol', 'Chain', 'Token', 'Supplied', 'Risk'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {status.yieldPositions.map((p, i) => (
              <motion.tr
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15, delay: i * 0.04 }}
              >
                <td style={tdStyle}>{p.protocol}</td>
                <td style={tdStyle}>{p.chain}</td>
                <td style={tdStyle}>{p.token || 'USDC'}</td>
                <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>
                  ${(Number(p.supplied) / 1e6).toFixed(2)}
                </td>
                <td style={tdStyle}>{p.riskScore}/10</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CurrentRates({ status }: { status: AgentStatus }) {
  if (status.currentRates.length === 0) return null

  return (
    <div className="mb-8">
      <SectionHeading title="Current rates" />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Protocol', 'Chain', 'APY', 'Risk-adj APY'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {status.currentRates.map((r, i) => (
              <motion.tr
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15, delay: i * 0.04 }}
              >
                <td style={tdStyle}>{r.protocol}</td>
                <td style={tdStyle}>{r.chain}</td>
                <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>
                  {r.apy.toFixed(2)}%
                </td>
                <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>
                  {r.riskAdjustedApy.toFixed(2)}%
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BazaarDiscovery() {
  const bazaar = useQuery({
    queryKey: ['bazaar-discovery'],
    queryFn: fetchBazaar,
    refetchInterval: 60000,
  })

  const data = bazaar.data
  if (!data) return null

  return (
    <div className="mb-8">
      <SectionHeading title="Bazaar discovery" />
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        {/* Agent identity header */}
        <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
          <div className="flex items-center gap-2 mb-1">
            <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{data.agent.name}</span>
            {data.agent.agentId && (
              <span style={{
                fontSize: '0.6875rem',
                padding: '0.0625rem 0.375rem',
                borderRadius: '4px',
                background: 'rgba(34,197,94,0.08)',
                color: '#22c55e',
                fontWeight: 500,
              }}>
                ERC-8004 #{data.agent.agentId}
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.4)' }}>
            {data.agent.description}
          </p>
        </div>

        {/* Protocols + chains */}
        <div style={{ padding: '0.625rem 1rem', borderBottom: '1px solid rgba(0,0,0,0.04)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(0,0,0,0.3)', fontWeight: 500 }}>Protocols</span>
            <div className="flex gap-1.5 mt-1">
              {data.agent.protocols.map(p => (
                <span key={p} style={{
                  fontSize: '0.6875rem',
                  padding: '0.125rem 0.5rem',
                  borderRadius: '4px',
                  background: 'rgba(0,0,0,0.04)',
                  color: 'rgba(0,0,0,0.5)',
                  fontFamily: 'monospace',
                }}>
                  {p}
                </span>
              ))}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(0,0,0,0.3)', fontWeight: 500 }}>Chains</span>
            <div className="flex gap-1.5 mt-1">
              {data.capabilities.chains.map(c => (
                <span key={c} style={{
                  fontSize: '0.6875rem',
                  padding: '0.125rem 0.5rem',
                  borderRadius: '4px',
                  background: 'rgba(0,0,0,0.04)',
                  color: 'rgba(0,0,0,0.5)',
                  fontFamily: 'monospace',
                }}>
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(0,0,0,0.3)', fontWeight: 500 }}>Schemes</span>
            <div className="flex gap-1.5 mt-1">
              {data.capabilities.schemes.map(s => (
                <span key={s} style={{
                  fontSize: '0.6875rem',
                  padding: '0.125rem 0.5rem',
                  borderRadius: '4px',
                  background: 'rgba(0,0,0,0.04)',
                  color: 'rgba(0,0,0,0.5)',
                  fontFamily: 'monospace',
                }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Services table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem 1rem', fontWeight: 500, color: 'rgba(0,0,0,0.3)', fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Endpoint</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 1rem', fontWeight: 500, color: 'rgba(0,0,0,0.3)', fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Price</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 1rem', fontWeight: 500, color: 'rgba(0,0,0,0.3)', fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Extensions</th>
              </tr>
            </thead>
            <tbody>
              {data.services.map((svc, i) => {
                const extKeys = svc.discovery ? Object.keys(svc.discovery) : []
                return (
                  <tr key={svc.endpoint} style={{ borderBottom: i < data.services.length - 1 ? '1px solid rgba(0,0,0,0.03)' : 'none' }}>
                    <td style={{ padding: '0.5rem 1rem', fontFamily: 'monospace', color: '#1a1a1a' }}>
                      {svc.endpoint}
                    </td>
                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'rgba(0,0,0,0.6)' }}>
                      ${svc.priceUsdc}
                    </td>
                    <td style={{ padding: '0.5rem 1rem' }}>
                      <div className="flex gap-1 flex-wrap">
                        {extKeys.map(ext => (
                          <span key={ext} style={{
                            fontSize: '0.625rem',
                            padding: '0.0625rem 0.375rem',
                            borderRadius: '3px',
                            background: ext === 'bazaar' ? 'rgba(34,197,94,0.08)' : ext === 'erc8004' ? 'rgba(59,130,246,0.08)' : 'rgba(0,0,0,0.04)',
                            color: ext === 'bazaar' ? '#22c55e' : ext === 'erc8004' ? '#3b82f6' : 'rgba(0,0,0,0.4)',
                            fontFamily: 'monospace',
                          }}>
                            {ext}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Discovery URL */}
        <div style={{
          padding: '0.5rem 1rem',
          borderTop: '1px solid rgba(0,0,0,0.04)',
          fontSize: '0.6875rem',
          color: 'rgba(0,0,0,0.3)',
          fontFamily: 'monospace',
        }}>
          GET /.well-known/t402/discovery
        </div>
      </div>
    </div>
  )
}

function RecentActivity({ transactions, explorerUrl }: { transactions?: Transaction[]; explorerUrl: string }) {
  const items = transactions?.slice(0, 20) || []
  const listRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(items.length)

  // Auto-scroll to top when new items appear
  useEffect(() => {
    if (items.length > prevCountRef.current && listRef.current) {
      listRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
    prevCountRef.current = items.length
  }, [items.length])

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        <SectionHeading title="Recent activity" />
        {items.length > 0 && (
          <span style={{ fontSize: '0.6875rem', color: 'rgba(0,0,0,0.25)', fontVariantNumeric: 'tabular-nums' }}>
            {items.length} transactions
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'rgba(0,0,0,0.4)' }}>No activity yet</p>
      ) : (
        <div ref={listRef} style={{ maxHeight: '480px', overflowY: 'auto' }}>
          {items.map((tx, i) => {
            const isRecent = Date.now() - new Date(tx.createdAt).getTime() < 30000
            return (
            <motion.div
              key={tx.id}
              className={isRecent ? 'activity-new' : ''}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15, delay: i * 0.03, ease: [0.16, 1, 0.3, 1] }}
              style={{ padding: '0.75rem 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <TxTypeBadge type={tx.type} />
                    <span style={{
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      fontVariantNumeric: 'tabular-nums',
                      color: tx.type === 'EARN' ? '#166534' : '#1a1a1a',
                    }}>
                      {tx.type === 'EARN' ? '+' : '-'}{dollar(tx.amount)} {tx.token}
                    </span>
                    {tx.txHash && (
                      <a
                        href={`${explorerUrl}/tx/${tx.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.6875rem',
                          color: 'rgba(0,0,0,0.25)',
                          textDecoration: 'none',
                          transition: 'color 120ms ease-out',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#1a1a1a')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(0,0,0,0.25)')}
                      >
                        tx
                      </a>
                    )}
                  </div>
                  <p style={{
                    fontSize: '0.8125rem',
                    color: 'rgba(0,0,0,0.4)',
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '600px',
                  }}>
                    {tx.description}
                  </p>
                </div>
                <span style={{
                  fontSize: '0.75rem',
                  color: 'rgba(0,0,0,0.25)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}>
                  {timeAgo(tx.createdAt)}
                </span>
              </div>
            </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function WdkEcosystem({ status }: { status: AgentStatus }) {
  const modules = status.wdkModules
  const security = status.security

  if (!modules) return null

  const moduleLabels: Record<string, string> = {
    '@tetherto/wdk': 'Core orchestrator',
    '@tetherto/wdk-wallet-evm': 'EVM wallet (Base Sepolia)',
    '@tetherto/wdk-wallet-evm-erc-4337': 'Smart Account (Eth Sepolia)',
    '@tetherto/wdk-protocol-lending-aave-evm': 'Aave V3 lending',
    '@tetherto/wdk-protocol-bridge-usdt0-evm': 'USDT0 cross-chain bridge',
    '@tetherto/wdk-protocol-swap-velora-evm': 'Velora DEX swaps',
    '@tetherto/wdk-pricing-bitfinex-http': 'Bitfinex price feeds',
    '@tetherto/wdk-secret-manager': 'Seed encryption (PBKDF2)',
    '@tetherto/wdk-indexer-http': 'USDT transfer indexing',
    '@tetherto/wdk-mcp-toolkit': 'MCP tools for Claude',
    '@tetherto/wdk-wallet-spark': 'Spark Lightning wallet',
  }

  return (
    <div className="mb-8">
      <SectionHeading title={`WDK ecosystem (${modules.length} modules)`} />
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div className="grid grid-cols-1 md:grid-cols-2">
          {modules.map((mod, i) => (
            <motion.div
              key={mod}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.12, delay: i * 0.02, ease: [0.16, 1, 0.3, 1] }}
              style={{
                padding: '0.5rem 0.875rem',
                borderBottom: '1px solid rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span style={{
                fontSize: '0.6875rem',
                fontFamily: 'monospace',
                color: '#1a1a1a',
                fontWeight: 500,
              }}>
                {mod.replace('@tetherto/', '')}
              </span>
              <span style={{
                fontSize: '0.6875rem',
                color: 'rgba(0,0,0,0.3)',
              }}>
                {moduleLabels[mod] || ''}
              </span>
            </motion.div>
          ))}
        </div>

        {security && (
          <div style={{
            padding: '0.625rem 0.875rem',
            borderTop: '1px solid rgba(0,0,0,0.06)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}>
            {[
              security.seedEncryption && 'Seed encrypted',
              `Max tx: ${security.maxTxAmount}`,
              `Daily limit: ${security.dailySpendLimit}`,
              security.killSwitch && 'Kill switch',
              `Min risk: ${security.yieldRiskThreshold}/10`,
            ].filter(Boolean).map(label => (
              <span key={String(label)} style={{
                fontSize: '0.6875rem',
                padding: '0.125rem 0.5rem',
                borderRadius: '999px',
                background: 'rgba(34, 197, 94, 0.08)',
                color: '#166534',
                fontWeight: 500,
              }}>
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Footer({ status }: { status: AgentStatus }) {
  return (
    <div style={{
      marginTop: '3rem',
      paddingTop: '1.5rem',
      borderTop: '1px solid rgba(0,0,0,0.06)',
      textAlign: 'center',
    }}>
      <p style={{ fontSize: '0.8125rem', color: 'rgba(0,0,0,0.25)' }}>
        Forage{status.identity ? ` #${status.identity.agentId}` : ''} · {status.totalRequests} requests served · powered by WDK + Claude
      </p>
      <p style={{ fontSize: '0.6875rem', color: 'rgba(0,0,0,0.15)', marginTop: '0.375rem' }}>
        Hackathon Galactica: WDK Edition 1
      </p>
    </div>
  )
}

// --- Small shared components ---

function SectionHeading({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{title}</h2>
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        style={{ flex: 1, borderTop: '1px dashed #22c55e', transformOrigin: 'left' }}
      />
    </div>
  )
}

function StatCard({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ padding: '1rem', background: '#ffffff' }}>
      <p style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.4)', marginBottom: '0.25rem' }}>{label}</p>
      <p style={{
        fontSize: '1.25rem',
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        color: valueColor || '#1a1a1a',
      }}>
        {value}
      </p>
    </div>
  )
}

function TxTypeBadge({ type }: { type: string }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    EARN: { bg: 'rgba(34,197,94,0.08)', text: '#166534' },
    SPEND_LLM: { bg: 'rgba(59,130,246,0.08)', text: '#1e40af' },
    SPEND_GAS: { bg: 'rgba(245,158,11,0.08)', text: '#92400e' },
    AAVE_SUPPLY: { bg: 'rgba(139,92,246,0.08)', text: '#5b21b6' },
    AAVE_WITHDRAW: { bg: 'rgba(139,92,246,0.08)', text: '#5b21b6' },
    DEFI_SUPPLY: { bg: 'rgba(139,92,246,0.08)', text: '#5b21b6' },
    DEFI_WITHDRAW: { bg: 'rgba(139,92,246,0.08)', text: '#5b21b6' },
    SWAP: { bg: 'rgba(236,72,153,0.08)', text: '#9d174d' },
    BRIDGE: { bg: 'rgba(6,182,212,0.08)', text: '#155e75' },
  }
  const c = colorMap[type] || { bg: 'rgba(0,0,0,0.06)', text: 'rgba(0,0,0,0.5)' }

  return (
    <span style={{
      display: 'inline-flex',
      padding: '0.0625rem 0.4375rem',
      borderRadius: '999px',
      fontSize: '0.6875rem',
      fontWeight: 600,
      background: c.bg,
      color: c.text,
    }}>
      {type.replace('_', ' ')}
    </span>
  )
}

// --- Shared styles ---

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.625rem 0.75rem',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: 'rgba(0,0,0,0.4)',
  borderBottom: '1px solid rgba(0,0,0,0.06)',
}

const tdStyle: React.CSSProperties = {
  padding: '0.625rem 0.75rem',
  fontSize: '0.875rem',
  borderBottom: '1px solid rgba(0,0,0,0.06)',
}

// --- Decision Log ---

const decisionColors: Record<string, string> = {
  HOLD: '#737373', SUPPLY_AAVE: '#22c55e', WITHDRAW_AAVE: '#f59e0b',
  ADJUST_PRICING: '#3b82f6', REDUCE_COSTS: '#f97316', EMERGENCY: '#ef4444',
  GATHER_INTELLIGENCE: '#8b5cf6', SWAP_TOKENS: '#06b6d4', UNKNOWN: '#a3a3a3',
}

function DecisionLog({ decisions }: { decisions?: AgentDecision[] }) {
  if (!decisions || decisions.length === 0) return null
  return (
    <section className="mb-8">
      <SectionHeading title="Agent Decisions" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {decisions.slice(0, 5).map((d) => {
          const c = decisionColors[d.action] || '#a3a3a3'
          return (
            <motion.div key={d.id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.15 }}
              style={{ padding: '0.75rem 1rem', borderRadius: '0.75rem', background: 'white', border: '1px solid rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.125rem 0.5rem', borderRadius: '9999px', background: `${c}15`, color: c, letterSpacing: '0.02em' }}>
                  {d.action}
                </span>
                {d.yieldRouter && d.yieldRouter !== 'SKIPPED' && (
                  <span style={{ fontSize: '0.6875rem', color: 'rgba(0,0,0,0.35)' }}>yield: {d.yieldRouter}</span>
                )}
                <span style={{ fontSize: '0.6875rem', color: 'rgba(0,0,0,0.3)', marginLeft: 'auto' }}>{timeAgo(d.timestamp)}</span>
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'rgba(0,0,0,0.65)', lineHeight: 1.5, margin: 0 }}>{d.reasoning}</p>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}

// --- Wallet Overview ---

function WalletOverview({ status, spark }: { status: AgentStatus; spark?: SparkInfo }) {
  return (
    <section className="mb-8">
      <SectionHeading title="Wallets" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
        <div style={{ padding: '1rem', borderRadius: '0.75rem', background: 'white', border: '1px solid rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.125rem 0.5rem', borderRadius: '9999px', background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>EOA</span>
            <span style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.4)' }}>Base Sepolia</span>
          </div>
          <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'rgba(0,0,0,0.5)', margin: '0 0 0.25rem' }}>{shortAddr(status.walletAddress)}</p>
          <p style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>{dollar(status.balanceUsdc)}</p>
        </div>
        {status.yieldWalletAddress && (
          <div style={{ padding: '1rem', borderRadius: '0.75rem', background: 'white', border: '1px solid rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.125rem 0.5rem', borderRadius: '9999px', background: 'rgba(139,92,246,0.1)', color: '#8b5cf6' }}>4337</span>
              <span style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.4)' }}>Eth Sepolia</span>
              <span style={{ fontSize: '0.625rem', padding: '0.0625rem 0.375rem', borderRadius: '9999px', background: 'rgba(34,197,94,0.1)', color: '#22c55e', fontWeight: 500 }}>gasless</span>
            </div>
            <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'rgba(0,0,0,0.5)', margin: '0 0 0.25rem' }}>{shortAddr(status.yieldWalletAddress)}</p>
            <p style={{ fontSize: '0.8125rem', color: 'rgba(0,0,0,0.5)', margin: 0 }}>Smart Account (Safe v1.4.1)</p>
          </div>
        )}
        {spark && spark.address && (
          <div style={{ padding: '1rem', borderRadius: '0.75rem', background: 'white', border: '1px solid rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.125rem 0.5rem', borderRadius: '9999px', background: 'rgba(249,115,22,0.1)', color: '#f97316' }}>Lightning</span>
              <span style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.4)' }}>Spark {spark.network}</span>
              <span style={{ fontSize: '0.625rem', padding: '0.0625rem 0.375rem', borderRadius: '9999px', background: 'rgba(249,115,22,0.08)', color: '#f97316', fontWeight: 500 }}>zero-fee</span>
            </div>
            <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'rgba(0,0,0,0.5)', margin: '0 0 0.25rem' }}>{shortAddr(spark.address)}</p>
            <p style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>{spark.balanceBtc} BTC</p>
            {spark.canReceiveLightning && (
              <p style={{ fontSize: '0.6875rem', color: 'rgba(0,0,0,0.35)', margin: '0.25rem 0 0' }}>Lightning invoices enabled</p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
