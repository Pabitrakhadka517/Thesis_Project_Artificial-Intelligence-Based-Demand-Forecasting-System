import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts'
import {
  Package, DollarSign, TrendingUp, TrendingDown, Bell,
  ShoppingCart, AlertTriangle, RefreshCw, Activity, Truck,
  ShoppingBag, Brain, CheckCircle, ShieldAlert, Users,
  BarChart2, Minus, ArrowRight,
  ChevronDown, ChevronUp, Target, Calendar,
} from 'lucide-react'
import { dashboardService }  from '@/services/dashboardService'
import { alertService }      from '@/services/alertService'
import { aiService }         from '@/services/aiService'
import { formatCurrency, formatRs, formatNumber, formatRelativeTime } from '@/utils'
import { useAuth }  from '@/hooks/useAuth'
import { useRole }  from '@/hooks/useRole'
import { PageHeader } from '@/components/common/PageHeader'
import { AIExplainability } from '@/components/common/AIExplainability'
import { ChartTooltip as SharedTooltip, PieChartTooltip } from '@/components/charts/ChartTooltip'
import { ChartEmptyState } from '@/components/charts/ChartEmptyState'
import { ALERT_PRIORITY_STYLES, CHART_PALETTE } from '@/constants/statusColors'
import { MOTION } from '@/constants'

// ── Constants ─────────────────────────────────────────────────────────────────
// Priority styling reuses the canonical alert-priority map (single source of
// truth, shared with the alerts page and Navbar's notification popover) —
// labels upper-cased here to match this card's original visual treatment.
const PRI = Object.fromEntries(
  Object.entries(ALERT_PRIORITY_STYLES).map(([k, s]) => [
    k,
    { label: s.label.toUpperCase(), color: s.color, bg: s.tint, border: s.color },
  ])
)
const PIE_COLORS = CHART_PALETTE

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtRs  = v => formatCurrency ? formatCurrency(v ?? 0) : `Rs. ${(v ?? 0).toLocaleString()}`
const fmtNum = v => formatNumber ? formatNumber(v ?? 0) : (v ?? 0).toLocaleString()

// ── Sub-components ────────────────────────────────────────────────────────────
function ConfidenceBar({ value, color }) {
  return (
    <div className="mt-2">
      <div className="flex justify-between mb-0.5">
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>AI Confidence</span>
        <span className="text-[10px] font-semibold" style={{ color }}>{value ?? '--'}%</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, value ?? 0)}%`, background: color }} />
      </div>
    </div>
  )
}

function TrendBadge({ trend }) {
  if (trend === 'increasing') return (
    <span className="flex items-center gap-0.5 text-[10px] font-semibold text-red-400">
      <TrendingUp className="h-3 w-3" /> Rising
    </span>
  )
  if (trend === 'decreasing') return (
    <span className="flex items-center gap-0.5 text-[10px] font-semibold text-green-400">
      <TrendingDown className="h-3 w-3" /> Falling
    </span>
  )
  return (
    <span className="flex items-center gap-0.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
      <Minus className="h-3 w-3" /> Stable
    </span>
  )
}

function RecommendationCard({ item, onNavigate }) {
  const [expanded, setExpanded] = useState(false)
  const pc = PRI[item.priority] || PRI.medium
  const chartData = (item.forecastData || []).map(d => ({
    v: d.yhat ?? d.demand ?? d.value ?? 0,
  }))
  const daysColor = item.daysOfStock != null
    ? (item.daysOfStock < 7 ? 'var(--color-danger)' : item.daysOfStock < 14 ? 'var(--brand-amber)' : 'var(--text-primary)')
    : 'var(--text-muted)'

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{
        background: 'var(--surface-card)',
        border: `1px solid var(--border)`,
        borderLeft: `4px solid ${pc.color}`,
      }}
    >
      {/* Header */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-full"
            style={{ background: pc.bg, color: pc.color }}>
            {pc.label}
          </span>
          {item.isRuleBased ? (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
              Rule-based
            </span>
          ) : (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5"
              style={{ background: 'var(--tint-primary)', color: 'var(--brand-blue)' }}>
              <Brain className="h-2.5 w-2.5" /> AI
            </span>
          )}
        </div>
        <p className="text-[14px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
          {item.productName}
        </p>
        <code className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{item.sku}</code>
        <p className="text-[11px] italic mt-1.5 leading-snug line-clamp-2"
          style={{ color: 'var(--text-muted)' }}>
          {item.reason}
        </p>
      </div>

      {/* Metric strip */}
      <div className="grid grid-cols-3 border-t border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="p-2.5 text-center border-r" style={{ borderColor: 'var(--border)' }}>
          <p className="text-[9px] uppercase font-semibold tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>
            In Stock
          </p>
          <p className="text-[17px] font-bold" style={{ color: item.currentStock <= 0 ? 'var(--color-danger)' : 'var(--text-primary)' }}>
            {fmtNum(item.currentStock)}
          </p>
        </div>
        <div className="p-2.5 text-center border-r" style={{ borderColor: 'var(--border)' }}>
          <p className="text-[9px] uppercase font-semibold tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>
            30d Demand
          </p>
          <p className="text-[17px] font-bold" style={{ color: 'var(--brand-blue)' }}>
            {item.forecastDemand != null ? Math.round(item.forecastDemand) : '--'}
          </p>
        </div>
        <div className="p-2.5 text-center">
          <p className="text-[9px] uppercase font-semibold tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>
            Days Left
          </p>
          <p className="text-[17px] font-bold" style={{ color: daysColor }}>
            {item.daysOfStock != null ? item.daysOfStock : '--'}
          </p>
        </div>
      </div>

      {/* Suggested purchase */}
      <div className="mx-3 mt-3 px-3 py-2.5 rounded-lg" style={{ background: pc.bg }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] uppercase font-semibold tracking-wide" style={{ color: pc.color }}>
              Suggested Purchase
            </p>
            <p className="text-[18px] font-bold leading-tight" style={{ color: pc.color }}>
              {fmtNum(item.suggestedPurchase)} units
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase font-semibold tracking-wide" style={{ color: pc.color }}>
              Est. Cost
            </p>
            <p className="text-[16px] font-bold leading-tight" style={{ color: pc.color }}>
              {fmtRs(item.estimatedCost)}
            </p>
          </div>
        </div>
      </div>

      {/* Sparkline */}
      {chartData.length > 2 && (
        <div className="px-3 pt-2 h-14">
          <ResponsiveContainer width="100%" height={48}>
            <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`sg-${item.productId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={pc.color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={pc.color} stopOpacity={0}    />
                </linearGradient>
              </defs>
              <Area dataKey="v" stroke={pc.color} strokeWidth={1.5}
                fill={`url(#sg-${item.productId})`} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Confidence + expand toggle */}
      <div className="px-3">
        {!item.isRuleBased && item.confidenceScore != null && (
          <ConfidenceBar value={item.confidenceScore} color={pc.color} />
        )}
      </div>

      {/* Expandable detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: MOTION.base, ease: MOTION.ease }}
            className="overflow-hidden"
          >
            <div className="px-3 pt-2">
              <AIExplainability
                compact
                currentStock={item.currentStock}
                forecastDemand={item.forecastDemand}
                dailyDemand={item.dailyDemand}
                leadTimeDays={item.leadTimeDays}
                safetyStock={item.safetyStock}
                reorderPoint={item.reorderPoint}
                eoq={item.eoq}
                suggestedPurchase={item.suggestedPurchase}
                reasoning={item.explanation || item.reason}
                isRuleBased={item.isRuleBased}
                hasHistoricalData={item.hasHistoricalData}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div className="px-3 py-3 mt-auto border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Truck className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {item.supplier?.name || 'No supplier'}
            </span>
            {item.demandTrend && item.demandTrend !== 'unknown' && (
              <TrendBadge trend={item.demandTrend} />
            )}
          </div>
          <button onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-0.5 text-[10px]"
            style={{ color: 'var(--text-muted)' }}>
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? 'Less' : 'More'}
          </button>
        </div>
        <button
          onClick={() => onNavigate('purchases', item.supplier?.name)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-80"
          style={{ background: pc.bg, color: pc.color }}
        >
          <ShoppingCart className="h-3.5 w-3.5" /> Create Purchase Order
        </button>
      </div>
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color = 'var(--brand-blue)', alert }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}
    >
      {/* Colored top accent bar */}
      <div style={{ height: 3, background: color }} />

      <div className="p-4">
        {/* Icon row */}
        <div className="flex items-center justify-between mb-3">
          <div className="p-2 rounded-lg" style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
            <Icon className="h-4 w-4" style={{ color }} />
          </div>
          {alert && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: `color-mix(in srgb, ${color} 13%, transparent)`, color }}>
              {alert}
            </span>
          )}
        </div>

        {/* Value — full card width, no icon competing for space */}
        <p className="text-[19px] font-bold leading-tight"
          style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>
          {value}
        </p>

        {/* Label — full width, wraps naturally, no truncation */}
        <p className="text-[11px] font-medium mt-1.5 leading-snug"
          style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>

        {sub && (
          <p className="text-[10px] mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Attention Tile — compact, clickable stat used in the consolidated
// "Needs Attention" zone so risk counts live in exactly one place on the
// page instead of being repeated across the KPI row, the decision banner,
// and a separate "Inventory Health" card. ──────────────────────────────────────
function AttentionTile({ icon: Icon, label, value, color, onClick }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-lg text-left transition-colors"
      style={{ background: 'var(--surface-muted)' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-muted)'}
    >
      <div className="p-2 rounded-lg shrink-0" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[19px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
          {fmtNum(value)}
        </p>
        <p className="text-[10.5px] leading-snug" style={{ color: 'var(--text-muted)' }}>{label}</p>
      </div>
    </button>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { user }            = useAuth()
  const { can, prefix }     = useRole()
  const navigate            = useNavigate()
  const queryClient         = useQueryClient()
  const [tab, setTab]       = useState('buy')
  const [trendDays, setTrendDays] = useState(7)

  const nav = (page, _supplier) => navigate(`${prefix}/${page}`)

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: sumData } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => dashboardService.getSummary(),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  const { data: recData, isLoading: recLoading, refetch: refetchRec } = useQuery({
    queryKey: ['dashboard-recommendations'],
    queryFn: () => dashboardService.getRecommendations(),
    staleTime: 3 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  })

  const { data: trendData } = useQuery({
    queryKey: ['dashboard-trend', trendDays],
    queryFn: () => dashboardService.getSalesTrend(trendDays),
    staleTime: 5 * 60 * 1000,
  })

  const { data: catData } = useQuery({
    queryKey: ['dashboard-categories'],
    queryFn: () => dashboardService.getCategoryDistribution(),
    staleTime: 10 * 60 * 1000,
  })

  const { data: txData } = useQuery({
    queryKey: ['dashboard-transactions'],
    queryFn: () => dashboardService.getRecentTransactions(6),
    staleTime: 2 * 60 * 1000,
  })

  const { data: alertData } = useQuery({
    queryKey: ['dashboard-alerts-recent'],
    queryFn: () => dashboardService.getRecentAlerts(5),
    staleTime: 2 * 60 * 1000,
  })

  const { data: aiHealthData, isError: aiHealthError } = useQuery({
    queryKey: ['ai-health'],
    queryFn: () => aiService.getHealth().then(r => r.data?.data),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    retry: false,
  })

  // ── Data extraction ────────────────────────────────────────────────────────
  const sum          = sumData?.data?.data || {}
  const rec          = recData?.data?.data || {}
  const buyNow       = rec.buyNow       || []
  const stockoutRisk = rec.stockoutRisk || []
  const overstockRisk= rec.overstockRisk|| []
  const recSummary   = rec.summary      || {}
  const suppliers    = rec.suppliers    || []
  const hasAiData    = !!rec.hasAiData
  const trend        = trendData?.data?.data?.trend || []
  const categories   = catData?.data?.data?.distribution || []
  const transactions = txData?.data?.data?.transactions  || []
  const alerts       = alertData?.data?.data?.alerts     ||
                       alertData?.data?.data?.items      || []
  const aiOnline     = aiHealthError ? false : aiHealthData?.online

  const tabItems = tab === 'buy' ? buyNow : tab === 'stockout' ? stockoutRisk : overstockRisk

  const greeting = useMemo(() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }, [])

  const today = useMemo(() =>
    new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  [])

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-recommendations'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-transactions'] })
  }

  return (
    <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <PageHeader
        title={`${greeting}, ${user?.fullName?.split(' ')[0] || 'there'}`}
        subtitle={
          <>
            <Calendar className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
            {today}
          </>
        }
        actions={
          <>
            <div className="flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-full"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
              <span className="h-2 w-2 rounded-full"
                style={{ background: aiOnline ? 'var(--color-success)' : 'var(--color-danger)' }} />
              <span style={{ color: 'var(--text-muted)' }}>AI {aiOnline ? 'Online' : 'Offline'}</span>
            </div>
            <button onClick={refreshAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-opacity hover:opacity-70"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </>
        }
      />

      {/* ══════════════════════════════════════════════════════════════════════
          TIER 1 — Business Performance. "How is the business performing?"
          Revenue + inventory value up top, sales trend and category mix
          directly beneath them so the numbers and their chart sit together. */}
      <div>
        <p className="section-label mb-3">Business Performance · How is the business doing?</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <KpiCard icon={DollarSign} label="Today's Revenue" value={fmtRs(sum.todayRevenue)}
            sub={`${sum.todaySalesCount ?? 0} sales today`} color="var(--color-success)" />
          <KpiCard icon={TrendingUp} label="Monthly Revenue" value={fmtRs(sum.monthlyRevenue)}
            sub={`${sum.monthlySalesCount ?? 0} sales this month`} color="var(--brand-blue)" />
          <KpiCard icon={Activity} label="Inventory Value" value={fmtRs(sum.inventoryValue)}
            sub={`${fmtNum(sum.totalProducts)} products in catalog`} color="var(--brand-cyan)" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Sales Trend */}
          <div className="lg:col-span-2 rounded-xl p-5"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                Sales Trend
              </h3>
              <div className="flex gap-1">
                {[7, 14, 30].map(d => (
                  <button key={d} onClick={() => setTrendDays(d)}
                    className="px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
                    style={trendDays === d
                      ? { background: 'var(--brand-blue)', color: '#fff' }
                      : { background: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            {trend.length === 0 ? (
              <ChartEmptyState height={200} message="No sales data for this period" />
            ) : (
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={trend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="var(--brand-blue)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--brand-blue)" stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false}
                      tickFormatter={d => d?.slice(5)} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false}
                      tickFormatter={v => formatRs(v)} />
                    <Tooltip content={<SharedTooltip formatY={fmtRs} />} />
                    <Area dataKey="revenue" name="Revenue" stroke="var(--brand-blue)" strokeWidth={2}
                      fill="url(#salesGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Category Distribution */}
          <div className="rounded-xl p-5"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
            <h3 className="text-[14px] font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
              Stock by Category
            </h3>
            {categories.length === 0 ? (
              <ChartEmptyState height={160} message="No category data yet" />
            ) : (
              <div style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={categories} dataKey="count" nameKey="category"
                      cx="50%" cy="50%" innerRadius={42} outerRadius={70} paddingAngle={3}>
                      {categories.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieChartTooltip formatValue={fmtNum} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-2 space-y-1.5 max-h-28 overflow-y-auto">
              {categories.slice(0, 6).map((c, i) => (
                <div key={c.category} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span style={{ color: 'var(--text-muted)' }}>{c.category || 'Uncategorised'}</span>
                  </div>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {fmtNum(c.count)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TIER 2 — Needs Attention. "What needs attention?"
          Every risk/attention count that used to be scattered across the
          decision banner, the KPI row, and a separate "Inventory Health"
          card now lives in exactly one place. */}
      <div>
        <p className="section-label mb-3">Needs Attention · What needs a decision today?</p>
        <div className="rounded-xl p-5"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
            <AttentionTile icon={AlertTriangle} label="Out of Stock" value={sum.outOfStock}
              color="var(--color-danger)" onClick={() => nav('inventory')} />
            <AttentionTile icon={ShieldAlert} label="Low Stock" value={sum.lowStock}
              color="var(--brand-amber)" onClick={() => nav('inventory')} />
            <AttentionTile icon={Package} label="Overstock" value={sum.overstock}
              color="var(--brand-purple)" onClick={() => nav('inventory')} />
            <AttentionTile icon={ShoppingCart} label="Pending POs" value={sum.pendingPurchases}
              color="var(--brand-blue)" onClick={() => nav('purchases')} />
            <AttentionTile icon={Bell} label="Unread Alerts" value={sum.unreadAlerts}
              color="var(--color-danger)" onClick={() => nav('alerts')} />
          </div>

          {/* Health distribution — the one visualization here that adds new
              insight (proportion, not just another count) rather than
              repeating a number shown elsewhere on the page. */}
          {sum.totalProducts > 0 && (
            <div className="pt-1">
              <div className="flex justify-between text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>
                <span>Catalog Health Distribution</span>
                <span>{Math.round(((sum.totalProducts - (sum.lowStock || 0) - (sum.outOfStock || 0)) / sum.totalProducts) * 100)}% healthy</span>
              </div>
              <div className="h-2 rounded-full flex overflow-hidden gap-0.5">
                {(() => {
                  const t = sum.totalProducts || 1
                  const ok = t - (sum.outOfStock || 0) - (sum.lowStock || 0)
                  return [
                    { pct: (ok / t) * 100, color: 'var(--color-success)' },
                    { pct: ((sum.lowStock || 0) / t) * 100, color: 'var(--brand-amber)' },
                    { pct: ((sum.outOfStock || 0) / t) * 100, color: 'var(--color-danger)' },
                  ].map((seg, i) => seg.pct > 0 && (
                    <div key={i} className="h-full rounded-full" style={{ width: `${seg.pct}%`, background: seg.color }} />
                  ))
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TIER 3 — Recommended Actions. "What should the manager do next?"
          The old full-height navy banner restated the same numbers the
          recommendation cards show right below it — condensed to one line
          so the actionable cards get the space and attention instead. */}
      <div>
        <p className="section-label mb-3">Recommended Actions · What should you do next?</p>

        <div className="rounded-xl p-4 mb-4 flex flex-wrap items-center justify-between gap-4"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', borderLeft: '4px solid var(--brand-blue)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg shrink-0" style={{ background: 'var(--tint-primary)' }}>
              <Target className="h-4 w-4" style={{ color: 'var(--brand-blue)' }} />
            </div>
            <div className="min-w-0">
              {recLoading ? (
                <p className="text-[13.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Loading recommendations…
                </p>
              ) : recSummary.productsToBuy > 0 ? (
                <p className="text-[13.5px] font-semibold flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-primary)' }}>
                  {recSummary.productsToBuy} product{recSummary.productsToBuy !== 1 ? 's' : ''} need purchasing today
                  {recSummary.criticalCount > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--tint-danger)', color: 'var(--color-danger)' }}>
                      {recSummary.criticalCount} critical
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-[13.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Inventory levels are healthy — no urgent restocking needed
                </p>
              )}
              {!hasAiData && (
                <p className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                  <Brain className="h-3 w-3" /> Run AI analysis in Forecasting for deeper insights
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-5 shrink-0">
            <div className="text-right">
              <p className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Budget</p>
              <p className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>{fmtRs(recSummary.totalBudget || 0)}</p>
            </div>
            <div className="text-right">
              <p className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Suppliers</p>
              <p className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>{recSummary.suppliersInvolved || 0}</p>
            </div>
            <button onClick={() => nav('forecasting')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-70"
              style={{ background: 'var(--tint-primary)', color: 'var(--brand-blue)' }}>
              <Brain className="h-3.5 w-3.5" /> {hasAiData ? 'View Full AI Report' : 'Run AI Analysis'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit"
          style={{ background: 'var(--surface-muted)' }}>
          {[
            { key: 'buy',      label: 'Buy Today',     count: buyNow.length,       color: 'var(--color-success)' },
            { key: 'stockout', label: 'Stockout Risk',  count: stockoutRisk.length, color: 'var(--color-danger)' },
            { key: 'overstock',label: 'Overstock Risk', count: overstockRisk.length,color: 'var(--brand-amber)' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all"
              style={tab === t.key
                ? { background: 'var(--surface-card)', color: 'var(--text-primary)', boxShadow: '0 1px 4px rgba(0,0,0,.1)' }
                : { color: 'var(--text-muted)' }}>
              {t.label}
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: `color-mix(in srgb, ${t.color} 14%, transparent)`, color: t.color }}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Cards grid */}
        {recLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-72 rounded-xl animate-pulse" style={{ background: 'var(--surface-muted)' }} />
            ))}
          </div>
        ) : tabItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 rounded-xl"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
            <CheckCircle className="h-12 w-12 mb-3" style={{ color: 'var(--color-success)' }} />
            <p className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              {tab === 'buy' ? 'No urgent purchases needed' :
               tab === 'stockout' ? 'No products at stockout risk' :
               'No overstock situations detected'}
            </p>
            <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>
              Inventory looks healthy for this category
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {tabItems.map(item => (
              <RecommendationCard key={`${tab}-${item.productId}`} item={item} onNavigate={nav} />
            ))}
          </div>
        )}

        {/* Suppliers to Contact — the natural next step once a purchase is
            decided, kept in the same tier as the recommendations. */}
        <div className="rounded-xl p-5 mt-4"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              Suppliers to Contact
            </h3>
            <button onClick={() => nav('suppliers')}
              className="flex items-center gap-1 text-[12px] transition-opacity hover:opacity-70"
              style={{ color: 'var(--brand-blue)' }}>
              View All <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          {suppliers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 rounded-lg"
              style={{ background: 'var(--surface-muted)' }}>
              <CheckCircle className="h-8 w-8 mb-2" style={{ color: 'var(--color-success)' }} />
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                No supplier orders needed right now
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {suppliers.slice(0, 6).map((s, i) => (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg"
                  style={{ background: 'var(--surface-muted)' }}>
                  <div className="h-8 w-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
                    style={{ background: `color-mix(in srgb, ${PIE_COLORS[i % PIE_COLORS.length]} 15%, transparent)`, color: PIE_COLORS[i % PIE_COLORS.length] }}>
                    {(s.name || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {s.name}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {s.products.length} item{s.products.length !== 1 ? 's' : ''} · {s.phone || 'No phone'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
                      {fmtRs(s.totalCost)}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>est. cost</p>
                  </div>
                </div>
              ))}
              {suppliers.length > 6 && (
                <div className="flex items-center justify-center p-3 rounded-lg text-[12px]"
                  style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
                  +{suppliers.length - 6} more suppliers
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Activity ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Alerts */}
        <div className="rounded-xl p-5"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[14px] font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Bell className="h-4 w-4" /> Recent Alerts
              {sum.unreadAlerts > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{ background: 'var(--tint-danger)', color: 'var(--color-danger)' }}>
                  {sum.unreadAlerts}
                </span>
              )}
            </h3>
            <button onClick={() => nav('alerts')} className="text-[11px]" style={{ color: 'var(--brand-blue)' }}>
              View All
            </button>
          </div>
          <div className="space-y-2">
            {alerts.length === 0 ? (
              <p className="text-[12px] py-4 text-center" style={{ color: 'var(--text-muted)' }}>No alerts</p>
            ) : alerts.slice(0, 5).map(a => (
              <div key={a._id} className="flex items-start gap-2 p-2 rounded-lg"
                style={{ background: 'var(--surface-muted)' }}>
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0"
                  style={{ color: (ALERT_PRIORITY_STYLES[a.severity] || ALERT_PRIORITY_STYLES.medium).color }} />
                <div className="min-w-0">
                  <p className="text-[12px] font-medium leading-snug truncate" style={{ color: 'var(--text-primary)' }}>
                    {a.message || a.title}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {formatRelativeTime ? formatRelativeTime(a.createdAt) : a.createdAt?.slice(0, 10)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Sales */}
        <div className="rounded-xl p-5"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[14px] font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <ShoppingBag className="h-4 w-4" /> Recent Sales
            </h3>
            <button onClick={() => nav('sales')} className="text-[11px]" style={{ color: 'var(--brand-blue)' }}>
              View All
            </button>
          </div>
          <div className="space-y-2">
            {transactions.filter(t => t.type === 'sale').slice(0, 4).map(t => (
              <div key={t.id} className="flex items-center justify-between p-2 rounded-lg"
                style={{ background: 'var(--surface-muted)' }}>
                <div className="min-w-0">
                  <p className="text-[12px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {t.party}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t.number}</p>
                </div>
                <p className="text-[13px] font-bold shrink-0 ml-2" style={{ color: 'var(--color-success)' }}>
                  {fmtRs(t.amount)}
                </p>
              </div>
            ))}
            {transactions.filter(t => t.type === 'sale').length === 0 && (
              <p className="text-[12px] py-4 text-center" style={{ color: 'var(--text-muted)' }}>No recent sales</p>
            )}
          </div>
        </div>

        {/* Recent Purchases */}
        <div className="rounded-xl p-5"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[14px] font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Truck className="h-4 w-4" /> Recent Purchases
            </h3>
            <button onClick={() => nav('purchases')} className="text-[11px]" style={{ color: 'var(--brand-blue)' }}>
              View All
            </button>
          </div>
          <div className="space-y-2">
            {transactions.filter(t => t.type === 'purchase').slice(0, 4).map(t => (
              <div key={t.id} className="flex items-center justify-between p-2 rounded-lg"
                style={{ background: 'var(--surface-muted)' }}>
                <div className="min-w-0">
                  <p className="text-[12px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {t.party}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t.number}</p>
                </div>
                <p className="text-[13px] font-bold shrink-0 ml-2" style={{ color: 'var(--brand-blue)' }}>
                  {fmtRs(t.amount)}
                </p>
              </div>
            ))}
            {transactions.filter(t => t.type === 'purchase').length === 0 && (
              <p className="text-[12px] py-4 text-center" style={{ color: 'var(--text-muted)' }}>No recent purchases</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Quick Actions ─────────────────────────────────────────────────────── */}
      {can('manager') && (
        <div className="rounded-xl p-5"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <h3 className="text-[14px] font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { icon: ShoppingBag,  label: 'New Sale',      page: 'sales',      color: 'var(--color-success)' },
              { icon: ShoppingCart, label: 'New Purchase',   page: 'purchases',  color: 'var(--brand-blue)' },
              { icon: Package,      label: 'Products',       page: 'products',   color: 'var(--brand-purple)' },
              { icon: Users,        label: 'Suppliers',      page: 'suppliers',  color: 'var(--brand-cyan)' },
              { icon: Brain,        label: 'AI Forecasting', page: 'forecasting',color: 'var(--brand-amber)' },
              { icon: BarChart2,    label: 'Reports',        page: 'reports',    color: 'var(--color-danger)' },
            ].map(({ icon: Icon, label, page, color }) => (
              <button key={page} onClick={() => nav(page)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl transition-colors hover:shadow-md"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                <div className="p-2.5 rounded-xl" style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
                  <Icon className="h-5 w-5" style={{ color }} />
                </div>
                <span className="text-[12px] font-medium text-center" style={{ color: 'var(--text-primary)' }}>
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
