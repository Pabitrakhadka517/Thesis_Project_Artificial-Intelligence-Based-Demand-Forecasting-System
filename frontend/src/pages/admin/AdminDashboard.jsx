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
  ShoppingBag, Brain, CheckCircle, ShieldAlert, Plus, Users,
  ClipboardList, BarChart2, Settings, Zap, Minus, ArrowRight,
  ChevronDown, ChevronUp, Target, Award, Calendar,
} from 'lucide-react'
import { dashboardService }  from '@/services/dashboardService'
import { alertService }      from '@/services/alertService'
import { aiService }         from '@/services/aiService'
import { formatCurrency, formatNumber, formatRelativeTime } from '@/utils'
import { useAuth }  from '@/hooks/useAuth'
import { useRole }  from '@/hooks/useRole'

// ── Constants ─────────────────────────────────────────────────────────────────
const PRI = {
  critical: { label: 'CRITICAL', color: '#EF4444', bg: 'rgba(239,68,68,.10)', border: '#EF4444' },
  high:     { label: 'HIGH',     color: '#F97316', bg: 'rgba(249,115,22,.10)', border: '#F97316' },
  medium:   { label: 'MEDIUM',   color: '#F59E0B', bg: 'rgba(245,158,11,.10)', border: '#F59E0B' },
  low:      { label: 'LOW',      color: '#2563EB', bg: 'rgba(37,99,235,.10)', border: '#2563EB' },
}
const PIE_COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4']

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
    ? (item.daysOfStock < 7 ? '#EF4444' : item.daysOfStock < 14 ? '#F59E0B' : 'var(--text-primary)')
    : 'var(--text-muted)'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
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
              style={{ background: 'rgba(37,99,235,.1)', color: '#2563EB' }}>
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
          <p className="text-[17px] font-bold" style={{ color: item.currentStock <= 0 ? '#EF4444' : 'var(--text-primary)' }}>
            {fmtNum(item.currentStock)}
          </p>
        </div>
        <div className="p-2.5 text-center border-r" style={{ borderColor: 'var(--border)' }}>
          <p className="text-[9px] uppercase font-semibold tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>
            30d Demand
          </p>
          <p className="text-[17px] font-bold" style={{ color: '#2563EB' }}>
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
            className="overflow-hidden"
          >
            <div className="px-3 pt-2 grid grid-cols-2 gap-1.5 text-[11px]">
              {[
                ['Reorder Point', item.reorderPoint],
                ['Safety Stock',  item.safetyStock],
                ['EOQ',           item.eoq],
                ['Stockout %',    item.stockoutProbability != null ? `${item.stockoutProbability}%` : null],
                ['Overstock %',   item.overstockProbability != null ? `${item.overstockProbability}%` : null],
                ['Lead Time',     item.leadTimeDays != null ? `${item.leadTimeDays}d` : null],
              ].filter(([, v]) => v != null).map(([label, val]) => (
                <div key={label} className="flex justify-between px-2 py-1 rounded"
                  style={{ background: 'var(--surface-muted)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <span className="font-semibold">{typeof val === 'number' ? fmtNum(val) : val}</span>
                </div>
              ))}
            </div>
            {item.explanation && (
              <p className="mx-3 mt-2 text-[11px] italic leading-relaxed"
                style={{ color: 'var(--text-muted)' }}>
                {item.explanation}
              </p>
            )}
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
    </motion.div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color = '#2563EB', alert }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}
    >
      {/* Colored top accent bar */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${color}, ${color}55)` }} />

      <div className="p-4">
        {/* Icon row */}
        <div className="flex items-center justify-between mb-3">
          <div className="p-2 rounded-lg" style={{ background: `${color}18` }}>
            <Icon className="h-4 w-4" style={{ color }} />
          </div>
          {alert && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${color}20`, color }}>
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
    </motion.div>
  )
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-3 py-2 text-[12px] shadow-lg"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
      <p className="font-semibold mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.dataKey === 'revenue' ? fmtRs(p.value) : fmtNum(p.value)}
        </p>
      ))}
    </div>
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

  const { data: aiHealthData } = useQuery({
    queryKey: ['ai-health'],
    queryFn: () => aiService.getHealth(),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
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
  const aiOnline     = aiHealthData?.data?.data?.status === 'online' ||
                       aiHealthData?.data?.status === 'online'

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

  const bannerGradient = 'var(--brand-primary)'

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-recommendations'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-transactions'] })
  }

  return (
    <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-bold" style={{ color: 'var(--text-primary)' }}>
            {greeting}, {user?.fullName?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            <Calendar className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
            {today}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-full"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
            <span className={`h-2 w-2 rounded-full ${aiOnline ? 'bg-green-400' : 'bg-red-400'}`} />
            <span style={{ color: 'var(--text-muted)' }}>AI {aiOnline ? 'Online' : 'Offline'}</span>
          </div>
          <button onClick={refreshAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-opacity hover:opacity-70"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      {/* ── Decision Banner ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-5 text-white overflow-hidden relative" style={{ background: bannerGradient }}>
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="relative">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <p className="text-white/60 text-[11px] font-bold uppercase tracking-widest mb-1">
                Executive Decision Brief · {today}
              </p>
              {recLoading ? (
                <p className="text-white/70 text-[18px]">Loading recommendations…</p>
              ) : recSummary.productsToBuy > 0 ? (
                <h2 className="text-[20px] font-bold leading-tight">
                  {recSummary.productsToBuy} product{recSummary.productsToBuy !== 1 ? 's' : ''} need purchasing today
                  {recSummary.criticalCount > 0 && (
                    <span className="ml-2 text-[13px] px-2 py-0.5 bg-red-500/30 rounded-full align-middle">
                      {recSummary.criticalCount} critical
                    </span>
                  )}
                </h2>
              ) : (
                <h2 className="text-[20px] font-bold text-white/80">
                  Inventory levels are healthy — no urgent restocking needed
                </h2>
              )}
              {!hasAiData && (
                <p className="text-white/50 text-[12px] mt-1 flex items-center gap-1">
                  <Brain className="h-3.5 w-3.5" /> Run AI analysis in Forecasting for deeper insights
                </p>
              )}
            </div>

            <div className="flex gap-4 lg:gap-8 shrink-0">
              <div className="text-center">
                <p className="text-white/50 text-[10px] uppercase tracking-wider">Budget Required</p>
                <p className="text-[22px] font-bold">{fmtRs(recSummary.totalBudget || 0)}</p>
              </div>
              <div className="text-center">
                <p className="text-white/50 text-[10px] uppercase tracking-wider">Suppliers</p>
                <p className="text-[22px] font-bold">{recSummary.suppliersInvolved || 0}</p>
              </div>
              <div className="text-center">
                <p className="text-white/50 text-[10px] uppercase tracking-wider">Stockout Risk</p>
                <p className="text-[22px] font-bold text-red-300">{recSummary.stockoutCount || 0}</p>
              </div>
              <div className="text-center">
                <p className="text-white/50 text-[10px] uppercase tracking-wider">Overstock</p>
                <p className="text-[22px] font-bold text-amber-300">{recSummary.overstockCount || 0}</p>
              </div>
            </div>
          </div>

          {/* Supplier pills */}
          {suppliers.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {suppliers.slice(0, 5).map(s => (
                <div key={s.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px]"
                  style={{ background: 'rgba(255,255,255,.10)' }}>
                  <Truck className="h-3 w-3 text-white/60" />
                  <span className="font-medium">{s.name}</span>
                  <span className="text-white/60">·</span>
                  <span className="text-white/80">{fmtRs(s.totalCost)}</span>
                  <span className="text-white/40">({s.products.length} items)</span>
                </div>
              ))}
              {suppliers.length > 5 && (
                <div className="flex items-center px-3 py-1.5 rounded-full text-[12px]"
                  style={{ background: 'rgba(255,255,255,.10)' }}>
                  +{suppliers.length - 5} more
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Recommendation Section ───────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>
              Purchase Recommendations
            </h2>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {hasAiData ? 'AI-powered · updated every 6h' : 'Rule-based · run AI analysis for full insights'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => nav('forecasting')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-70"
              style={{ background: 'rgba(37,99,235,.1)', color: '#2563EB' }}>
              <Brain className="h-3.5 w-3.5" /> {hasAiData ? 'View Full AI Report' : 'Run AI Analysis'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit"
          style={{ background: 'var(--surface-muted)' }}>
          {[
            { key: 'buy',      label: 'Buy Today',     count: buyNow.length,       color: '#10B981' },
            { key: 'stockout', label: 'Stockout Risk',  count: stockoutRisk.length, color: '#EF4444' },
            { key: 'overstock',label: 'Overstock Risk', count: overstockRisk.length,color: '#F59E0B' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all"
              style={tab === t.key
                ? { background: 'var(--surface-card)', color: 'var(--text-primary)', boxShadow: '0 1px 4px rgba(0,0,0,.1)' }
                : { color: 'var(--text-muted)' }}>
              {t.label}
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: `${t.color}22`, color: t.color }}>
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
            <CheckCircle className="h-12 w-12 mb-3" style={{ color: '#10B981' }} />
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
            <AnimatePresence>
              {tabItems.map((item, i) => (
                <motion.div key={`${tab}-${item.productId}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}>
                  <RecommendationCard item={item} onNavigate={nav} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard icon={DollarSign}    label="Today's Revenue"  value={fmtRs(sum.todayRevenue)}    sub={`${sum.todaySalesCount ?? 0} sales`}     color="#10B981" />
        <KpiCard icon={TrendingUp}    label="Monthly Revenue"  value={fmtRs(sum.monthlyRevenue)}   sub={`${sum.monthlySalesCount ?? 0} this month`} color="#2563EB" />
        <KpiCard icon={Package}       label="Total Products"   value={fmtNum(sum.totalProducts)}    sub={`${sum.lowStock ?? 0} low stock`}        color="#8B5CF6"
          alert={sum.outOfStock > 0 ? `${sum.outOfStock} out` : undefined} />
        <KpiCard icon={AlertTriangle} label="Low Stock"        value={fmtNum(sum.lowStock)}         sub="Below reorder level"                      color="#F59E0B" />
        <KpiCard icon={ShoppingCart}  label="Pending POs"      value={fmtNum(sum.pendingPurchases)} sub="Orders in transit"                        color="#EF4444" />
        <KpiCard icon={Activity}      label="Inventory Value"  value={fmtRs(sum.inventoryValue)}    sub="Current stock value"                      color="#06B6D4" />
      </div>

      {/* ── Charts Row ───────────────────────────────────────────────────────── */}
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
                    ? { background: '#2563EB', color: '#fff' }
                    : { background: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#2563EB" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false}
                  tickFormatter={d => d?.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false}
                  tickFormatter={v => `Rs${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Area dataKey="revenue" name="Revenue" stroke="#2563EB" strokeWidth={2}
                  fill="url(#salesGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Distribution */}
        <div className="rounded-xl p-5"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <h3 className="text-[14px] font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Stock by Category
          </h3>
          {categories.length === 0 ? (
            <div className="flex items-center justify-center h-40"
              style={{ color: 'var(--text-muted)' }}>No data</div>
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
                  <Tooltip formatter={(v, n) => [fmtNum(v), n]} />
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

      {/* ── Supplier Board + Inventory Health ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Supplier Board */}
        <div className="rounded-xl p-5"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              Suppliers to Contact
            </h3>
            <button onClick={() => nav('suppliers')}
              className="flex items-center gap-1 text-[12px] transition-opacity hover:opacity-70"
              style={{ color: '#2563EB' }}>
              View All <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          {suppliers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 rounded-lg"
              style={{ background: 'var(--surface-muted)' }}>
              <CheckCircle className="h-8 w-8 mb-2" style={{ color: '#10B981' }} />
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                No supplier orders needed right now
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {suppliers.slice(0, 5).map((s, i) => (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg"
                  style={{ background: 'var(--surface-muted)' }}>
                  <div className="h-8 w-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
                    style={{ background: `${PIE_COLORS[i % PIE_COLORS.length]}22`, color: PIE_COLORS[i % PIE_COLORS.length] }}>
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
            </div>
          )}
        </div>

        {/* Inventory Health */}
        <div className="rounded-xl p-5"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              Inventory Health
            </h3>
            <button onClick={() => nav('inventory')}
              className="flex items-center gap-1 text-[12px] transition-opacity hover:opacity-70"
              style={{ color: '#2563EB' }}>
              View All <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Out of Stock',  value: sum.outOfStock,  color: '#EF4444', icon: AlertTriangle },
              { label: 'Low Stock',     value: sum.lowStock,    color: '#F59E0B', icon: ShieldAlert  },
              { label: 'Overstock',     value: sum.overstock,   color: '#8B5CF6', icon: Package      },
              { label: 'Total Active',  value: sum.totalProducts,color:'#10B981', icon: CheckCircle  },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3 p-3 rounded-lg"
                style={{ background: 'var(--surface-muted)' }}>
                <div className="p-2 rounded-lg" style={{ background: `${color}1a` }}>
                  <Icon className="h-4 w-4" style={{ color }} />
                </div>
                <div>
                  <p className="text-[20px] font-bold" style={{ color: 'var(--text-primary)' }}>
                    {fmtNum(value)}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          {sum.totalProducts > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>
                <span>Health Distribution</span>
                <span>{Math.round(((sum.totalProducts - (sum.lowStock || 0) - (sum.outOfStock || 0)) / sum.totalProducts) * 100)}% healthy</span>
              </div>
              <div className="h-2 rounded-full flex overflow-hidden gap-0.5">
                {(() => {
                  const t = sum.totalProducts || 1
                  const ok = t - (sum.outOfStock || 0) - (sum.lowStock || 0)
                  return [
                    { pct: (ok / t) * 100, color: '#10B981' },
                    { pct: ((sum.lowStock || 0) / t) * 100, color: '#F59E0B' },
                    { pct: ((sum.outOfStock || 0) / t) * 100, color: '#EF4444' },
                  ].map((seg, i) => seg.pct > 0 && (
                    <div key={i} className="h-full rounded-full" style={{ width: `${seg.pct}%`, background: seg.color }} />
                  ))
                })()}
              </div>
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
                  style={{ background: 'rgba(239,68,68,.1)', color: '#EF4444' }}>
                  {sum.unreadAlerts}
                </span>
              )}
            </h3>
            <button onClick={() => nav('alerts')} className="text-[11px]" style={{ color: '#2563EB' }}>
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
                  style={{ color: a.severity === 'critical' ? '#EF4444' : a.severity === 'high' ? '#F97316' : '#F59E0B' }} />
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
            <button onClick={() => nav('sales')} className="text-[11px]" style={{ color: '#2563EB' }}>
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
                <p className="text-[13px] font-bold shrink-0 ml-2" style={{ color: '#10B981' }}>
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
            <button onClick={() => nav('purchases')} className="text-[11px]" style={{ color: '#2563EB' }}>
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
                <p className="text-[13px] font-bold shrink-0 ml-2" style={{ color: '#2563EB' }}>
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
              { icon: ShoppingBag,  label: 'New Sale',      page: 'sales',      color: '#10B981' },
              { icon: ShoppingCart, label: 'New Purchase',   page: 'purchases',  color: '#2563EB' },
              { icon: Package,      label: 'Products',       page: 'products',   color: '#8B5CF6' },
              { icon: Users,        label: 'Suppliers',      page: 'suppliers',  color: '#06B6D4' },
              { icon: Brain,        label: 'AI Forecasting', page: 'forecasting',color: '#F59E0B' },
              { icon: BarChart2,    label: 'Reports',        page: 'reports',    color: '#EF4444' },
            ].map(({ icon: Icon, label, page, color }) => (
              <button key={page} onClick={() => nav(page)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl transition-all hover:scale-105 hover:shadow-md"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                <div className="p-2.5 rounded-xl" style={{ background: `${color}1a` }}>
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
