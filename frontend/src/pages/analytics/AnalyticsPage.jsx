import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3, Package, TrendingUp, ShoppingBag,
  RefreshCw, DollarSign, Layers, AlertTriangle,
  Activity, Target, Cpu, ChevronDown, Zap, Download,
} from 'lucide-react'
import { AdvancedTab } from './AdvancedTab'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { analyticsService } from '@/services/analyticsService'
import { inventoryService } from '@/services/inventoryService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/common/Card'
import { AreaChart } from '@/components/charts/AreaChart'
import { BarChart } from '@/components/charts/BarChart'
import { LineChart } from '@/components/charts/LineChart'
import { PieChart } from '@/components/charts/PieChart'
import { ChartEmptyState } from '@/components/charts/ChartEmptyState'
import { SkeletonChart } from '@/components/common/Skeleton'
import { ErrorState } from '@/components/common/ErrorState'
import { EmptyState } from '@/components/common/EmptyState'
import { formatNumber, formatDate, exportCSV, formatRs } from '@/utils'
import { CHART_PALETTE, STOCK_STATUS_STYLES } from '@/constants/statusColors'

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'dashboard', label: 'Dashboard',  icon: BarChart3   },
  { id: 'inventory', label: 'Inventory',  icon: Package     },
  { id: 'forecast',  label: 'Forecast',   icon: TrendingUp  },
  { id: 'product',   label: 'Product',    icon: ShoppingBag },
  { id: 'advanced',  label: 'Advanced',   icon: Zap         },
]

// Static chart series-config arrays hoisted to module scope (rather than
// recreated inline in JSX every render) so the memoized chart wrapper
// components below can actually skip re-rendering when unrelated state
// on this query-heavy page changes.
const REVENUE_TREND_AREAS   = [
  { key: 'revenue', label: 'Revenue (Rs.)', color: 'var(--brand-blue)' },
  { key: 'orders',  label: 'Orders',        color: 'var(--brand-purple)' },
]
const MONTHLY_TREND_BARS    = [
  { key: 'revenue',  label: 'Revenue (Rs.)', color: 'var(--brand-blue)' },
  { key: 'quantity', label: 'Quantity',      color: 'var(--color-success)' },
]
const TOP_REVENUE_BARS      = [{ key: 'revenue',  label: 'Revenue (Rs.)',   color: 'var(--brand-blue)' }]
const TOP_QUANTITY_BARS     = [{ key: 'quantity', label: 'Quantity (units)', color: 'var(--brand-purple)' }]
const MODEL_ACCURACY_BARS   = [
  { key: 'avg_mae',  label: 'MAE',  color: 'var(--brand-blue)' },
  { key: 'avg_rmse', label: 'RMSE', color: 'var(--brand-amber)' },
]
const MODEL_COVERAGE_COLORS = ['var(--brand-purple)', 'var(--color-success)', 'var(--color-danger)', '#94A3B8']
const DEMAND_BY_CATEGORY_BARS = [
  { key: 'prophet', label: 'Prophet',       color: 'var(--brand-purple)' },
  { key: 'rf',      label: 'Random Forest', color: 'var(--color-success)' },
  { key: 'lstm',    label: 'LSTM',           color: 'var(--color-danger)' },
]
const ACTUAL_VS_FORECAST_LINES = [
  { key: 'actual',   label: 'Actual',   color: 'var(--brand-blue)' },
  { key: 'forecast', label: 'Forecast', color: 'var(--brand-purple)' },
]
const CATEGORY_PERF_BARS  = [{ key: 'revenue', label: 'Revenue (Rs.)', color: 'var(--brand-blue)' }]
const VELOCITY_BARS       = [{ key: 'velocity_per_day', label: 'Units/day', color: 'var(--color-success)' }]
const SKU_TREND_AREAS     = [
  { key: 'revenue',  label: 'Revenue (Rs.)', color: 'var(--brand-blue)' },
  { key: 'quantity', label: 'Quantity',       color: 'var(--color-success)' },
]
const STOCK_BY_CATEGORY_BARS = [{ key: 'total_value',   label: 'Stock Value (Rs.)',    color: 'var(--brand-blue)' }]
const TURNOVER_BARS          = [{ key: 'turnover_rate', label: 'Turnover Rate (×/yr)', color: 'var(--color-success)' }]

const DAY_OPTIONS = [
  { value: 7,   label: '7 days'   },
  { value: 14,  label: '14 days'  },
  { value: 30,  label: '30 days'  },
  { value: 60,  label: '60 days'  },
  { value: 90,  label: '90 days'  },
  { value: 180, label: '6 months' },
  { value: 365, label: '1 year'   },
]

// Canonical palette/status colors (constants/statusColors.js) — previously
// redefined locally with drifting values against the app-wide chart palette.
const PIE_COLORS = CHART_PALETTE

const STATUS_COLORS = Object.fromEntries(
  Object.entries(STOCK_STATUS_STYLES).map(([k, v]) => [k, v.color])
)

const SCATTER_COLORS = STATUS_COLORS
const STATUS_PIE_COLORS = [STATUS_COLORS.healthy, STATUS_COLORS.low, STATUS_COLORS.critical, STATUS_COLORS.out_of_stock, STATUS_COLORS.overstock]


function pct(v) { return v != null ? `${v}%` : '—' }

// ── Shared UI Atoms ───────────────────────────────────────────────────────────

function KPI({ label, value, sub, color = 'var(--brand-blue)', loading }) {
  return (
    <div className="rounded-xl p-4"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', borderLeft: `3px solid ${color}`, boxShadow: 'var(--shadow-xs)' }}>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>{label}</p>
      {loading
        ? <div className="skeleton h-8 w-24 rounded" />
        : <p className="text-[24px] font-bold num leading-none" style={{ color }}>{value}</p>
      }
      {sub && <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

function SelectDays({ value, onChange }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="appearance-none pr-7 pl-3 py-1.5 text-[12px] font-medium rounded-lg"
        style={{
          background: 'var(--surface-input)', border: '1.5px solid var(--border)',
          color: 'var(--text-primary)', cursor: 'pointer', outline: 'none',
        }}
      >
        {DAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
        style={{ color: 'var(--text-muted)' }} />
    </div>
  )
}

// Downloads whatever table a card is showing as CSV — analytics previously
// had no export mechanism anywhere on this page.
function ExportBtn({ rows, filename }) {
  return (
    <button
      onClick={() => rows?.length && exportCSV(rows, `${filename}.csv`)}
      disabled={!rows?.length}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
      style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
      <Download className="h-3 w-3" /> Export
    </button>
  )
}

function ChartCard({ title, subtitle, action, loading, error, onRetry, height = 260, children }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {subtitle && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
        </div>
        {action}
      </CardHeader>
      <CardContent>
        {loading ? <SkeletonChart height={height} /> : error ? <ErrorState error={error} onRetry={onRetry} /> : children}
      </CardContent>
    </Card>
  )
}

// Custom scatter tooltip
function ScatterTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload || {}
  return (
    <div className="chart-tooltip text-[12px]">
      <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{d.name || `SKU ${d.sku_id}`}</p>
      {d.category && <p style={{ color: 'var(--text-muted)' }}>{d.category}</p>}
      <p style={{ color: 'var(--color-danger)' }}>Stockout risk: {(d.x * 100).toFixed(1)}%</p>
      <p style={{ color: 'var(--brand-indigo)' }}>Overstock risk: {(d.y * 100).toFixed(1)}%</p>
      <p className="mt-1 capitalize font-medium"
        style={{ color: STATUS_COLORS[d.status] || '#94A3B8' }}>{d.status?.replace('_', ' ')}</p>
    </div>
  )
}

// ── TAB 1 — Dashboard Analytics ───────────────────────────────────────────────

function DashboardTab() {
  const [days, setDays] = useState(30)
  const [topBy, setTopBy] = useState('revenue')

  const { data: summary, isLoading: sumLoading, isError: sumError, error: sumErr, refetch: sumRefetch } = useQuery({
    queryKey: ['analytics', 'dashboard', 'summary'],
    queryFn: () => analyticsService.getDashboardSummary().then(r => r.data?.data),
  })

  const { data: trend, isLoading: trendLoading, isError: trendError, error: trendErr, refetch: trendRefetch } = useQuery({
    queryKey: ['analytics', 'dashboard', 'trend', days],
    queryFn: () => analyticsService.getRevenueTrend(days).then(r => r.data?.data),
  })

  const { data: breakdown, isLoading: bdLoading, isError: bdError, error: bdErr, refetch: bdRefetch } = useQuery({
    queryKey: ['analytics', 'dashboard', 'breakdown', days],
    queryFn: () => analyticsService.getRevenueBreakdown(days).then(r => r.data?.data),
  })

  const { data: topProducts, isLoading: topLoading, isError: topError, error: topErr, refetch: topRefetch } = useQuery({
    queryKey: ['analytics', 'dashboard', 'top-products', topBy, days],
    queryFn: () => analyticsService.getDashboardTopProducts(10, topBy, days).then(r => r.data?.data),
  })

  const { data: monthly, isLoading: monthlyLoading, isError: monthlyError, error: monthlyErr, refetch: monthlyRefetch } = useQuery({
    queryKey: ['analytics', 'dashboard', 'monthly'],
    queryFn: () => analyticsService.getMonthlyTrend(12).then(r => r.data?.data),
  })

  const { data: heatmap, isLoading: hmLoading, isError: hmError, error: hmErr, refetch: hmRefetch } = useQuery({
    queryKey: ['analytics', 'dashboard', 'heatmap'],
    queryFn: () => analyticsService.getSalesHeatmap(90).then(r => r.data?.data),
  })

  const stockStatus = summary?.stock_status || {}
  const totalTracked = Object.values(stockStatus).reduce((a, b) => a + b, 0)

  const statusPieData = useMemo(() => Object.entries(stockStatus).map(([k, v]) => ({
    name: k.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
    value: v,
  })), [stockStatus])

  // Heatmap grid: days 1-7 × hours 0-23
  const hmLookup = {}
  ;(heatmap || []).forEach(r => { hmLookup[`${r.day_of_week}-${r.hour}`] = r.orders })
  const hmMax = Math.max(...Object.values(hmLookup), 1)
  const DOW_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      {sumError ? (
        <ErrorState error={sumErr} onRetry={sumRefetch} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPI label="Revenue (30d)"    value={formatRs(summary?.revenue_30d)}        color="var(--brand-blue)" loading={sumLoading} />
          <KPI label="Revenue (7d)"     value={formatRs(summary?.revenue_7d)}          color="var(--color-success)" loading={sumLoading} />
          <KPI label="Growth vs Prev"   value={pct(summary?.revenue_growth_pct)}       color={summary?.revenue_growth_pct >= 0 ? 'var(--color-success)' : 'var(--color-danger)'} loading={sumLoading} />
          <KPI label="Transactions"     value={formatNumber(summary?.total_transactions_30d)} color="var(--brand-purple)" loading={sumLoading} />
          <KPI label="Avg Order Value"  value={formatRs(summary?.avg_order_value_30d)} color="var(--brand-amber)" loading={sumLoading} />
          <KPI label="Unread Alerts"    value={formatNumber(summary?.unread_alerts)}    color="var(--color-danger)" loading={sumLoading} />
        </div>
      )}

      {/* Revenue trend */}
      <ChartCard
        title="Revenue Trend"
        subtitle={`Daily revenue and order volume`}
        loading={trendLoading}
        error={trendError && trendErr}
        onRetry={trendRefetch}
        height={240}
        action={<SelectDays value={days} onChange={setDays} />}
      >
        <AreaChart
          data={trend || []}
          areas={REVENUE_TREND_AREAS}
          xKey="date" height={240}
          formatXAxis={v => formatDate(v, 'MMM d')}
          formatYAxis={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
        />
      </ChartCard>

      {/* Revenue breakdown + stock health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Revenue by Category" subtitle={`Last ${days} days`} loading={bdLoading} error={bdError && bdErr} onRetry={bdRefetch} height={280}>
          <PieChart
            data={(breakdown || []).map(d => ({ ...d, name: d.name || 'Unknown' }))}
            nameKey="name" valueKey="value" height={280} donut colors={PIE_COLORS}
          />
        </ChartCard>

        <ChartCard title="Stock Health Distribution" subtitle={`${totalTracked} total SKUs tracked`} loading={sumLoading} error={sumError && sumErr} onRetry={sumRefetch} height={280}>
          <PieChart
            data={statusPieData} nameKey="name" valueKey="value"
            height={280} donut colors={STATUS_PIE_COLORS}
          />
        </ChartCard>
      </div>

      {/* Top products */}
      <ChartCard
        title="Top Products"
        subtitle="Sorted by selected metric"
        loading={topLoading}
        error={topError && topErr}
        onRetry={topRefetch}
        height={260}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTopBy('revenue')}
              className="px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-all"
              style={{
                background: topBy === 'revenue' ? 'rgba(37,99,235,.12)' : 'transparent',
                color: topBy === 'revenue' ? 'var(--brand-blue)' : 'var(--text-muted)',
                border: `1.5px solid ${topBy === 'revenue' ? 'var(--brand-blue)' : 'var(--border)'}`,
              }}
            >Revenue</button>
            <button
              onClick={() => setTopBy('quantity')}
              className="px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-all"
              style={{
                background: topBy === 'quantity' ? 'rgba(139,92,246,.12)' : 'transparent',
                color: topBy === 'quantity' ? 'var(--brand-purple)' : 'var(--text-muted)',
                border: `1.5px solid ${topBy === 'quantity' ? 'var(--brand-purple)' : 'var(--border)'}`,
              }}
            >Quantity</button>
          </div>
        }
      >
        <BarChart
          data={(topProducts || []).map(d => ({
            ...d, name: d.name?.length > 14 ? d.name.slice(0, 14) + '…' : (d.name || `SKU ${d.sku_id}`),
          }))}
          bars={topBy === 'revenue' ? TOP_REVENUE_BARS : TOP_QUANTITY_BARS}
          xKey="name" height={260}
          formatYAxis={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
        />
      </ChartCard>

      {/* Monthly trend */}
      <ChartCard title="Monthly Revenue Trend" subtitle="Last 12 months" loading={monthlyLoading} error={monthlyError && monthlyErr} onRetry={monthlyRefetch} height={240}>
        <BarChart
          data={(monthly || []).map(d => ({ ...d, label: d.label }))}
          bars={MONTHLY_TREND_BARS}
          xKey="label" height={240}
          formatYAxis={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
        />
      </ChartCard>

      {/* Sales heatmap */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Sales Activity Heatmap</CardTitle>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Order frequency by day of week and hour (last 90 days)</p>
          </div>
        </CardHeader>
        <CardContent>
          {hmLoading
            ? <SkeletonChart height={160} />
            : hmError
            ? <ErrorState error={hmErr} onRetry={hmRefetch} />
            : (
              <div className="overflow-x-auto">
                <div className="min-w-160">
                  {/* Hour labels */}
                  <div className="flex gap-0.5 ml-10 mb-1">
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} className="text-[9px] text-center" style={{ width: '3.7%', color: 'var(--text-muted)' }}>
                        {h % 4 === 0 ? `${h}h` : ''}
                      </div>
                    ))}
                  </div>
                  {/* Grid */}
                  {DOW_LABELS.map((day, di) => (
                    <div key={day} className="flex items-center gap-0.5 mb-0.5">
                      <span className="text-[10px] font-medium w-10 shrink-0 text-right pr-2" style={{ color: 'var(--text-muted)' }}>{day}</span>
                      {Array.from({ length: 24 }, (_, h) => {
                        const count = hmLookup[`${di + 1}-${h}`] || 0
                        const intensity = count / hmMax
                        const alpha = intensity > 0 ? Math.max(0.08, intensity) : 0.03
                        return (
                          <div
                            key={h}
                            title={`${day} ${h}:00 — ${count} orders`}
                            className="rounded-sm flex-1"
                            style={{
                              height: 20,
                              background: count > 0
                                ? `rgba(37,99,235,${alpha})`
                                : 'var(--surface-muted)',
                              border: '1px solid var(--border-subtle)',
                            }}
                          />
                        )
                      })}
                    </div>
                  ))}
                  <div className="flex items-center gap-2 mt-2 justify-end">
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Low</span>
                    {[0.05, 0.2, 0.4, 0.6, 0.8, 1].map(v => (
                      <div key={v} className="h-3.5 w-6 rounded-sm"
                        style={{ background: `rgba(37,99,235,${v})` }} />
                    ))}
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>High</span>
                  </div>
                </div>
              </div>
            )
          }
        </CardContent>
      </Card>
    </div>
  )
}

// ── TAB 2 — Inventory Analytics ───────────────────────────────────────────────

function InventoryTab() {
  const [turnoverDays, setTurnoverDays] = useState(90)

  const { data: summary, isLoading: sumLoading, isError: sumError, error: sumErr, refetch: sumRefetch } = useQuery({
    queryKey: ['analytics', 'inventory', 'summary'],
    queryFn: () => analyticsService.getInventorySummary().then(r => r.data?.data),
  })

  const { data: statusBreakdown, isLoading: sbLoading, isError: sbError, error: sbErr, refetch: sbRefetch } = useQuery({
    queryKey: ['analytics', 'inventory', 'status'],
    queryFn: () => analyticsService.getInventoryStatusBreakdown().then(r => r.data?.data),
  })

  const { data: catStock, isLoading: catLoading, isError: catError, error: catErr, refetch: catRefetch } = useQuery({
    queryKey: ['analytics', 'inventory', 'category-stock'],
    queryFn: () => analyticsService.getCategoryStock().then(r => r.data?.data),
  })

  const { data: scatter, isLoading: scatterLoading, isError: scatterError, error: scatterErr, refetch: scatterRefetch } = useQuery({
    queryKey: ['analytics', 'inventory', 'risk-scatter'],
    queryFn: () => analyticsService.getRiskScatter(300).then(r => r.data?.data),
  })

  const { data: turnover, isLoading: toLoading, isError: toError, error: toErr, refetch: toRefetch } = useQuery({
    queryKey: ['analytics', 'inventory', 'turnover', turnoverDays],
    queryFn: () => analyticsService.getInventoryTurnover(turnoverDays).then(r => r.data?.data),
  })

  const { data: lowStock, isLoading: lsLoading, isError: lsError, error: lsErr, refetch: lsRefetch } = useQuery({
    queryKey: ['analytics', 'inventory', 'low-stock'],
    queryFn: () => analyticsService.getLowStockItems(20).then(r => r.data?.data),
  })

  // Backend returns snake_case status names (e.g. 'out_of_stock'); map to display labels for pie
  const statusColors = (statusBreakdown || []).map(d =>
    STATUS_COLORS[d.name] || '#94A3B8'
  )
  const statusDisplayData = (statusBreakdown || []).map(d => ({
    name:  d.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    value: d.value,
  }))

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      {sumError ? (
        <ErrorState error={sumErr} onRetry={sumRefetch} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KPI label="Total Units"      value={formatNumber(summary?.total_inventory_units, 0)}  color="var(--brand-blue)"  loading={sumLoading} />
          <KPI label="Inventory Value"  value={formatRs(summary?.total_inventory_value)}          color="var(--color-success)"  loading={sumLoading} />
          <KPI label="Avg Days Supply"  value={summary?.avg_days_of_supply != null ? `${formatNumber(summary.avg_days_of_supply, 0)} d` : '—'} color="var(--brand-purple)" loading={sumLoading} />
          <KPI label="High Stockout Risk" value={formatNumber(summary?.high_stockout_risk_items)} color="var(--color-danger)"  loading={sumLoading} sub="≥50% risk" />
          <KPI label="Zero Stock Items" value={formatNumber(summary?.zero_stock_items)}            color="#991B1B"  loading={sumLoading} />
        </div>
      )}

      {/* Status breakdown + category stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Stock Status Distribution" subtitle="Current inventory health overview" loading={sbLoading} error={sbError && sbErr} onRetry={sbRefetch} height={280}>
          <PieChart
            data={statusDisplayData}
            nameKey="name" valueKey="value" height={280} donut
            colors={statusColors.length ? statusColors : PIE_COLORS}
          />
        </ChartCard>

        <ChartCard title="Stock by Category" subtitle="Total units held per category" loading={catLoading} error={catError && catErr} onRetry={catRefetch} height={280}>
          <BarChart
            data={(catStock || []).map(d => ({ ...d, name: d.name?.length > 16 ? d.name.slice(0, 16) + '…' : d.name }))}
            bars={STOCK_BY_CATEGORY_BARS}
            xKey="name" height={280} horizontal
            formatXAxis={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
          />
        </ChartCard>
      </div>

      {/* Risk scatter */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Risk Scatter Matrix</CardTitle>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Stockout risk (X) vs Overstock risk (Y) — each dot is one SKU
            </p>
          </div>
          <div className="flex items-center gap-3">
            {Object.entries(SCATTER_COLORS).map(([s, c]) => (
              <div key={s} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c }} />
                <span className="text-[10px] font-medium capitalize" style={{ color: 'var(--text-muted)' }}>
                  {s.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {scatterLoading
            ? <SkeletonChart height={320} />
            : scatterError
            ? <ErrorState error={scatterErr} onRetry={scatterRefetch} />
            : !scatter?.length
            ? <ChartEmptyState height={320} message="No risk data for this period" />
            : (
              <ResponsiveContainer width="100%" height={320}>
                <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis
                    type="number" dataKey="x" name="Stockout Risk" domain={[0, 1]}
                    tickFormatter={v => `${(v * 100).toFixed(0)}%`}
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
                    label={{ value: 'Stockout Risk →', position: 'insideBottom', offset: -12, fontSize: 11, fill: 'var(--text-muted)' }}
                  />
                  <YAxis
                    type="number" dataKey="y" name="Overstock Risk" domain={[0, 1]}
                    tickFormatter={v => `${(v * 100).toFixed(0)}%`}
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={46}
                    label={{ value: 'Overstock Risk →', angle: -90, position: 'insideLeft', fontSize: 11, fill: 'var(--text-muted)' }}
                  />
                  <ZAxis range={[40, 80]} />
                  <Tooltip content={<ScatterTooltip />} />
                  <Scatter data={scatter || []} opacity={0.75}>
                    {(scatter || []).map((entry, i) => (
                      <Cell key={i} fill={SCATTER_COLORS[entry.status] || '#94A3B8'} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            )
          }
        </CardContent>
      </Card>

      {/* Turnover */}
      <ChartCard
        title="Inventory Turnover by Category"
        subtitle="Annualized turnover rate — higher = faster moving"
        loading={toLoading}
        error={toError && toErr}
        onRetry={toRefetch}
        height={240}
        action={<SelectDays value={turnoverDays} onChange={setTurnoverDays} />}
      >
        <BarChart
          data={(turnover || []).map(d => ({ ...d, name: d.name?.length > 14 ? d.name.slice(0, 14) + '…' : d.name }))}
          bars={TURNOVER_BARS}
          xKey="name" height={240}
        />
      </ChartCard>

      {/* Low stock table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Items Requiring Attention</CardTitle>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Low, critical, and out-of-stock items sorted by stockout risk
            </p>
          </div>
          <ExportBtn
            filename={`low-stock-${new Date().toISOString().slice(0,10)}`}
            rows={(lowStock || []).map(item => ({
              Product: item.name || `SKU ${item.sku_id}`, Category: item.category || '—',
              Status: item.status, 'Current Stock': item.current_stock, 'Reorder Point': item.reorder_point,
              'Safety Stock': item.safety_stock, 'Order Qty': item.recommended_order_qty,
              'Stockout Risk %': item.stockout_risk != null ? (item.stockout_risk * 100).toFixed(1) : '',
            }))}
          />
        </CardHeader>
        <CardContent style={{ padding: 0 }}>
          {lsLoading
            ? <div className="p-4"><SkeletonChart height={200} /></div>
            : lsError
            ? <ErrorState error={lsErr} onRetry={lsRefetch} />
            : !(lowStock?.length)
            ? <EmptyState icon={Package} title="No low-stock items" description="All inventory levels are healthy." />
            : (
              <div className="overflow-x-auto">
                <table className="table-enterprise">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th className="text-right">Current</th>
                      <th className="text-right">ROP</th>
                      <th className="text-right">Safety Stock</th>
                      <th className="text-right">Order Qty</th>
                      <th className="text-right">Stockout Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStock.map((item, i) => {
                      const color = STATUS_COLORS[item.status] || '#94A3B8'
                      const riskPct = (item.stockout_risk * 100).toFixed(1)
                      return (
                        <tr key={i} className={`row-${item.status}`}>
                          <td className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {item.name || `SKU ${item.sku_id}`}
                          </td>
                          <td style={{ color: 'var(--text-muted)' }}>{item.category || '—'}</td>
                          <td>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize"
                              style={{ background: `color-mix(in srgb, ${color} 10%, transparent)`, color, border: `1px solid color-mix(in srgb, ${color} 19%, transparent)` }}>
                              {item.status?.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="text-right num">{formatNumber(item.current_stock, 1)}</td>
                          <td className="text-right num" style={{ color: 'var(--brand-amber)' }}>{formatNumber(item.reorder_point, 0)}</td>
                          <td className="text-right num" style={{ color: 'var(--brand-blue)' }}>{formatNumber(item.safety_stock, 0)}</td>
                          <td className="text-right num font-semibold" style={{ color: 'var(--color-danger)' }}>
                            {item.recommended_order_qty > 0 ? formatNumber(item.recommended_order_qty) : '—'}
                          </td>
                          <td className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="progress-micro w-14">
                                <div className="progress-micro-fill"
                                  style={{ width: `${riskPct}%`, background: parseFloat(riskPct) > 70 ? 'var(--color-danger)' : parseFloat(riskPct) > 40 ? 'var(--brand-amber)' : 'var(--color-success)' }} />
                              </div>
                              <span className="num text-[12px] font-semibold w-10 text-right"
                                style={{ color: parseFloat(riskPct) > 70 ? 'var(--color-danger)' : parseFloat(riskPct) > 40 ? 'var(--brand-amber)' : 'var(--color-success)' }}>
                                {riskPct}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          }
        </CardContent>
      </Card>
    </div>
  )
}

// ── TAB 3 — Forecast Analytics ────────────────────────────────────────────────

function ForecastTab() {
  const [selectedSku, setSelectedSku]   = useState(null)
  const [forecastDays, setForecastDays] = useState(30)
  const [catDays, setCatDays]           = useState(30)

  const { data: accuracy, isLoading: accLoading, isError: accError, error: accErr, refetch: accRefetch } = useQuery({
    queryKey: ['analytics', 'forecast', 'accuracy'],
    queryFn: () => analyticsService.getForecastAccuracy().then(r => r.data?.data),
  })

  const { data: coverage, isLoading: covLoading, isError: covError, error: covErr, refetch: covRefetch } = useQuery({
    queryKey: ['analytics', 'forecast', 'coverage'],
    queryFn: () => analyticsService.getModelCoverage().then(r => r.data?.data),
  })

  const { data: demandCat, isLoading: dcLoading, isError: dcError, error: dcErr, refetch: dcRefetch } = useQuery({
    queryKey: ['analytics', 'forecast', 'by-category', catDays],
    queryFn: () => analyticsService.getDemandByCategory(catDays).then(r => r.data?.data),
  })

  // Lazy SKU list for demand-vs-actual selector
  const { data: skuList } = useQuery({
    queryKey: ['inventory', 'sku-list'],
    queryFn: () => inventoryService.getProducts({ page: 1, size: 200 }).then(r => r.data?.data || []),
    staleTime: 10 * 60_000,
  })

  const { data: dvActual, isLoading: dvaLoading, isError: dvaError, error: dvaErr, refetch: dvaRefetch } = useQuery({
    queryKey: ['analytics', 'forecast', 'demand-vs-actual', selectedSku, forecastDays],
    queryFn: () => analyticsService.getDemandVsActual(selectedSku, forecastDays).then(r => r.data?.data),
    enabled: !!selectedSku,
  })

  const MODEL_COLORS = { Prophet: 'var(--brand-purple)', 'Random Forest': 'var(--color-success)', LSTM: 'var(--color-danger)' }

  return (
    <div className="space-y-5">
      {/* Accuracy comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Model Accuracy Comparison" subtitle="Average MAPE (%) per model — lower is better" loading={accLoading} error={accError && accErr} onRetry={accRefetch} height={260}>
          {!(accuracy?.length)
            ? <EmptyState icon={Cpu} title="No models trained" description="Train at least one model to see accuracy metrics." />
            : (
              <>
                {/* Accuracy metric cards */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {(accuracy || []).map(m => (
                    <div key={m.model} className="rounded-xl p-3 text-center"
                      style={{ background: `${MODEL_COLORS[m.model] || '#94A3B8'}10`, border: `1px solid ${MODEL_COLORS[m.model] || '#94A3B8'}25` }}>
                      <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: MODEL_COLORS[m.model] || '#94A3B8' }}>{m.model}</p>
                      <p className="text-[20px] font-bold num" style={{ color: MODEL_COLORS[m.model] || '#94A3B8' }}>{m.avg_mape?.toFixed(1)}%</p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>MAPE · {m.sku_count} SKUs</p>
                    </div>
                  ))}
                </div>
                <BarChart
                  data={accuracy || []}
                  bars={MODEL_ACCURACY_BARS}
                  xKey="model" height={180}
                />
              </>
            )
          }
        </ChartCard>

        <ChartCard title="Model Coverage" subtitle="SKUs with a trained model" loading={covLoading} error={covError && covErr} onRetry={covRefetch} height={260}>
          <PieChart
            data={(coverage?.chart_data || []).filter(d => d.value > 0)}
            nameKey="name" valueKey="value" height={260} donut
            colors={MODEL_COVERAGE_COLORS}
          />
        </ChartCard>
      </div>

      {/* Demand by category */}
      <ChartCard
        title="Forecast Demand by Category"
        subtitle="Aggregated predicted demand per model type"
        loading={dcLoading}
        error={dcError && dcErr}
        onRetry={dcRefetch}
        height={260}
        action={<SelectDays value={catDays} onChange={setCatDays} />}
      >
        {!(demandCat?.length)
          ? <EmptyState icon={TrendingUp} title="No forecast data" description="Generate forecasts to see demand by category." />
          : (
            <BarChart
              data={(demandCat || []).map(d => ({ ...d, name: d.name?.length > 14 ? d.name.slice(0, 14) + '…' : d.name }))}
              bars={DEMAND_BY_CATEGORY_BARS}
              xKey="name" height={260}
              formatYAxis={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
            />
          )
        }
      </ChartCard>

      {/* Demand vs Actual */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Actual vs Forecast</CardTitle>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Compare real sales against the best available model forecast for a single SKU
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SelectDays value={forecastDays} onChange={setForecastDays} />
            <select
              value={selectedSku || ''}
              onChange={e => setSelectedSku(e.target.value || null)}
              className="appearance-none px-3 py-1.5 text-[12px] font-medium rounded-lg"
              style={{
                background: 'var(--surface-input)', border: '1.5px solid var(--border)',
                color: selectedSku ? 'var(--text-primary)' : 'var(--text-muted)',
                outline: 'none', maxWidth: 180,
              }}
            >
              <option value="">Select a product…</option>
              {(skuList || []).map(s => (
                <option key={s.id || s.sku_id} value={s.id || s.sku_id}>
                  {s.name || `SKU ${s.id}`}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedSku
            ? <EmptyState icon={TrendingUp} title="Select a product" description="Choose a product above to compare actual vs forecasted demand." />
            : dvaLoading
            ? <SkeletonChart height={280} />
            : dvaError
            ? <ErrorState error={dvaErr} onRetry={dvaRefetch} />
            : !(dvActual?.series?.length)
            ? <EmptyState icon={TrendingUp} title="No data available" description="No sales or forecast records found for this SKU in the selected period." />
            : (
              <>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Model used:</span>
                  <span className="text-[11px] font-semibold" style={{ color: MODEL_COLORS[dvActual.model_used] || '#94A3B8' }}>
                    {dvActual.model_used}
                  </span>
                </div>
                <LineChart
                  data={dvActual.series || []}
                  lines={ACTUAL_VS_FORECAST_LINES}
                  xKey="date" height={280}
                  formatXAxis={v => formatDate(v, 'MMM d')}
                />
              </>
            )
          }
        </CardContent>
      </Card>
    </div>
  )
}

// ── TAB 4 — Product Analytics ─────────────────────────────────────────────────

function ProductTab() {
  const [catDays, setCatDays] = useState(30)
  const [velDays, setVelDays] = useState(30)
  const [compDays, setCompDays] = useState(30)
  const [priceDays, setPriceDays] = useState(90)
  const [selectedSkuTrend, setSelectedSkuTrend] = useState(null)
  const [trendDays, setTrendDays] = useState(90)

  const { data: catPerf, isLoading: cpLoading, isError: cpError, error: cpErr, refetch: cpRefetch } = useQuery({
    queryKey: ['analytics', 'product', 'category-performance', catDays],
    queryFn: () => analyticsService.getCategoryPerformance(catDays).then(r => r.data?.data),
  })

  const { data: velocity, isLoading: velLoading, isError: velError, error: velErr, refetch: velRefetch } = useQuery({
    queryKey: ['analytics', 'product', 'velocity', velDays],
    queryFn: () => analyticsService.getVelocityRanking(20, velDays).then(r => r.data?.data),
  })

  const { data: comparison, isLoading: compLoading, isError: compError, error: compErr, refetch: compRefetch } = useQuery({
    queryKey: ['analytics', 'product', 'period-comparison', compDays],
    queryFn: () => analyticsService.getPeriodComparison(compDays).then(r => r.data?.data),
  })

  const { data: prices, isLoading: pricesLoading, isError: pricesError, error: pricesErr, refetch: pricesRefetch } = useQuery({
    queryKey: ['analytics', 'product', 'price-trends', priceDays],
    queryFn: () => analyticsService.getPriceTrends(priceDays).then(r => r.data?.data),
  })

  const { data: skuTrend, isLoading: skuTrendLoading, isError: skuTrendError, error: skuTrendErr, refetch: skuTrendRefetch } = useQuery({
    queryKey: ['analytics', 'product', 'sku-trend', selectedSkuTrend, trendDays],
    queryFn: () => analyticsService.getSkuTrend(selectedSkuTrend, trendDays).then(r => r.data?.data),
    enabled: !!selectedSkuTrend,
  })

  const { data: skuList } = useQuery({
    queryKey: ['inventory', 'sku-list'],
    queryFn: () => inventoryService.getProducts({ page: 1, size: 200 }).then(r => r.data?.data || []),
    staleTime: 10 * 60_000,
  })

  // Build pivot lines for price trends chart
  const pivotData = prices?.pivot || []
  const allCategories = pivotData.length > 0
    ? Object.keys(pivotData[0]).filter(k => k !== 'label')
    : []
  const catColors = ['var(--brand-blue)','var(--color-success)','var(--brand-amber)','var(--color-danger)','var(--brand-purple)','var(--brand-cyan)']

  return (
    <div className="space-y-5">
      {/* Category performance table + bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Category Revenue Performance"
          subtitle="Revenue, transactions, and growth breakdown"
          loading={cpLoading}
          error={cpError && cpErr}
          onRetry={cpRefetch}
          height={300}
          action={<SelectDays value={catDays} onChange={setCatDays} />}
        >
          <BarChart
            data={(catPerf || []).map(d => ({ ...d, name: d.name?.length > 14 ? d.name.slice(0, 14) + '…' : d.name }))}
            bars={CATEGORY_PERF_BARS}
            xKey="name" height={300} horizontal
            formatXAxis={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
          />
        </ChartCard>

        {/* Category performance table */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Category Metrics</CardTitle>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Revenue, AOV, and share per category</p>
            </div>
            <ExportBtn
              filename={`category-performance-${new Date().toISOString().slice(0,10)}`}
              rows={(catPerf || []).map(c => ({
                Category: c.name, Revenue: c.revenue, Transactions: c.transactions,
                'Avg Order Value': c.avg_order_value, 'Revenue Share %': c.revenue_pct,
              }))}
            />
          </CardHeader>
          <CardContent style={{ padding: 0 }}>
            {cpLoading
              ? <div className="p-4"><SkeletonChart height={260} /></div>
              : cpError
              ? <ErrorState error={cpErr} onRetry={cpRefetch} />
              : (
                <div className="overflow-x-auto">
                  <table className="table-enterprise">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th className="text-right">Revenue</th>
                        <th className="text-right">Txns</th>
                        <th className="text-right">AOV</th>
                        <th className="text-right">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(catPerf || []).map((c, i) => (
                        <tr key={i}>
                          <td className="font-semibold" style={{ color: 'var(--text-primary)' }}>{c.name}</td>
                          <td className="text-right num">{formatRs(c.revenue)}</td>
                          <td className="text-right num">{formatNumber(c.transactions)}</td>
                          <td className="text-right num">{formatRs(c.avg_order_value)}</td>
                          <td className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="progress-micro w-12">
                                <div className="progress-micro-fill"
                                  style={{ width: `${c.revenue_pct}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                              </div>
                              <span className="num text-[11px] w-10 text-right" style={{ color: 'var(--text-muted)' }}>
                                {c.revenue_pct?.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </CardContent>
        </Card>
      </div>

      {/* Sales velocity */}
      <ChartCard
        title="Sales Velocity Ranking"
        subtitle="Average units sold per day"
        loading={velLoading}
        error={velError && velErr}
        onRetry={velRefetch}
        height={280}
        action={<SelectDays value={velDays} onChange={setVelDays} />}
      >
        <BarChart
          data={(velocity || []).map(d => ({
            ...d,
            name: d.name?.length > 14 ? d.name.slice(0, 14) + '…' : (d.name || `SKU ${d.sku_id}`),
          }))}
          bars={VELOCITY_BARS}
          xKey="name" height={280} horizontal
        />
      </ChartCard>

      {/* Period comparison */}
      <ChartCard
        title="Period-over-Period Revenue"
        subtitle={`This ${compDays}d vs previous ${compDays}d by category`}
        loading={compLoading}
        error={compError && compErr}
        onRetry={compRefetch}
        height={280}
        action={<SelectDays value={compDays} onChange={setCompDays} />}
      >
        <BarChart
          data={(comparison || []).map(d => ({ ...d, name: d.name?.length > 14 ? d.name.slice(0, 14) + '…' : d.name }))}
          bars={[
            { key: 'current_revenue',  label: `Current ${compDays}d`,  color: 'var(--brand-blue)' },
            { key: 'previous_revenue', label: `Previous ${compDays}d`, color: '#94A3B8' },
          ]}
          xKey="name" height={280}
          formatYAxis={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
        />
      </ChartCard>

      {/* Price trends */}
      <ChartCard
        title="Unit Price Trends by Category"
        subtitle="Monthly average selling price across categories"
        loading={pricesLoading}
        error={pricesError && pricesErr}
        onRetry={pricesRefetch}
        height={280}
        action={<SelectDays value={priceDays} onChange={setPriceDays} />}
      >
        {!pivotData.length
          ? <EmptyState icon={Activity} title="No price data" description="Price trend data requires sales records with unit prices." />
          : (
            <LineChart
              data={pivotData}
              lines={allCategories.map((cat, i) => ({
                key: cat, label: cat, color: catColors[i % catColors.length],
              }))}
              xKey="label" height={280}
              formatYAxis={v => formatRs(v)}
            />
          )
        }
      </ChartCard>

      {/* SKU-level trend */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Product Sales Trend</CardTitle>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Daily revenue and quantity for a single product</p>
          </div>
          <div className="flex items-center gap-2">
            <SelectDays value={trendDays} onChange={setTrendDays} />
            <select
              value={selectedSkuTrend || ''}
              onChange={e => setSelectedSkuTrend(e.target.value || null)}
              className="appearance-none px-3 py-1.5 text-[12px] font-medium rounded-lg"
              style={{
                background: 'var(--surface-input)', border: '1.5px solid var(--border)',
                color: selectedSkuTrend ? 'var(--text-primary)' : 'var(--text-muted)',
                outline: 'none', maxWidth: 200,
              }}
            >
              <option value="">Select a product…</option>
              {(skuList || []).map(s => (
                <option key={s.id || s.sku_id} value={s.id || s.sku_id}>
                  {s.name || `SKU ${s.id}`}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedSkuTrend
            ? <EmptyState icon={ShoppingBag} title="Select a product" description="Choose a product above to view its sales trend." />
            : skuTrendLoading
            ? <SkeletonChart height={260} />
            : skuTrendError
            ? <ErrorState error={skuTrendErr} onRetry={skuTrendRefetch} />
            : !(skuTrend?.series?.length)
            ? <EmptyState icon={ShoppingBag} title="No sales data" description="No transactions found for this product in the selected period." />
            : (
              <AreaChart
                data={skuTrend.series}
                areas={SKU_TREND_AREAS}
                xKey="date" height={260}
                formatXAxis={v => formatDate(v, 'MMM d')}
                formatYAxis={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
              />
            )
          }
        </CardContent>
      </Card>
    </div>
  )
}

// ── Page shell ────────────────────────────────────────────────────────────────

const TAB_CONTENT = {
  dashboard: DashboardTab,
  inventory: InventoryTab,
  forecast:  ForecastTab,
  product:   ProductTab,
  advanced:  AdvancedTab,
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const TabContent = TAB_CONTENT[activeTab]

  return (
    <div className="space-y-5 pb-6 page-enter">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <BarChart3 className="h-4 w-4" style={{ color: 'var(--brand-blue)' }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Analytics</span>
          </div>
          <h1 className="text-[24px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Business Analytics</h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Revenue, inventory health, forecast accuracy, and product performance
          </p>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        {TABS.map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all"
              style={{
                background:  active ? 'var(--surface-card)' : 'transparent',
                color:       active ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow:   active ? 'var(--shadow-xs)'    : 'none',
                border:      active ? '1px solid var(--border)' : '1px solid transparent',
              }}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <TabContent />
    </div>
  )
}
