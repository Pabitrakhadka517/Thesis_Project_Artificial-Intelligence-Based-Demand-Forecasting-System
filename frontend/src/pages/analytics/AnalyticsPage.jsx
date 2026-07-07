import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart3, Package, TrendingUp, ShoppingBag,
  RefreshCw, DollarSign, Layers, AlertTriangle,
  Activity, Target, Cpu, ChevronDown, Zap,
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
import { SkeletonChart } from '@/components/common/Skeleton'
import { ErrorState } from '@/components/common/ErrorState'
import { EmptyState } from '@/components/common/EmptyState'
import { formatNumber, formatDate } from '@/utils'

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'dashboard', label: 'Dashboard',  icon: BarChart3   },
  { id: 'inventory', label: 'Inventory',  icon: Package     },
  { id: 'forecast',  label: 'Forecast',   icon: TrendingUp  },
  { id: 'product',   label: 'Product',    icon: ShoppingBag },
  { id: 'advanced',  label: 'Advanced',   icon: Zap         },
]

const DAY_OPTIONS = [
  { value: 7,   label: '7 days'   },
  { value: 14,  label: '14 days'  },
  { value: 30,  label: '30 days'  },
  { value: 60,  label: '60 days'  },
  { value: 90,  label: '90 days'  },
  { value: 180, label: '6 months' },
  { value: 365, label: '1 year'   },
]

const PIE_COLORS = ['#2563EB','#22C55E','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899','#14B8A6']

const STATUS_COLORS = {
  healthy:      '#22C55E',
  low:          '#F59E0B',
  critical:     '#EF4444',
  out_of_stock: '#DC2626',
  overstock:    '#6366F1',
}

const SCATTER_COLORS = {
  healthy:      '#22C55E',
  low:          '#F59E0B',
  critical:     '#EF4444',
  out_of_stock: '#DC2626',
  overstock:    '#6366F1',
}

function formatRs(v) {
  if (v == null) return '—'
  if (v >= 1_000_000) return `Rs. ${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `Rs. ${(v / 1_000).toFixed(0)}K`
  return `Rs. ${formatNumber(v)}`
}

function pct(v) { return v != null ? `${v}%` : '—' }

// ── Shared UI Atoms ───────────────────────────────────────────────────────────

function KPI({ label, value, sub, color = '#2563EB', loading }) {
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

function ChartCard({ title, subtitle, action, loading, height = 260, children }) {
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
        {loading ? <SkeletonChart height={height} /> : children}
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
      <p style={{ color: '#EF4444' }}>Stockout risk: {(d.x * 100).toFixed(1)}%</p>
      <p style={{ color: '#6366F1' }}>Overstock risk: {(d.y * 100).toFixed(1)}%</p>
      <p className="mt-1 capitalize font-medium"
        style={{ color: STATUS_COLORS[d.status] || '#94A3B8' }}>{d.status?.replace('_', ' ')}</p>
    </div>
  )
}

// ── TAB 1 — Dashboard Analytics ───────────────────────────────────────────────

function DashboardTab() {
  const [days, setDays] = useState(30)
  const [topBy, setTopBy] = useState('revenue')

  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ['analytics', 'dashboard', 'summary'],
    queryFn: () => analyticsService.getDashboardSummary().then(r => r.data?.data),
  })

  const { data: trend, isLoading: trendLoading } = useQuery({
    queryKey: ['analytics', 'dashboard', 'trend', days],
    queryFn: () => analyticsService.getRevenueTrend(days).then(r => r.data?.data),
  })

  const { data: breakdown, isLoading: bdLoading } = useQuery({
    queryKey: ['analytics', 'dashboard', 'breakdown', days],
    queryFn: () => analyticsService.getRevenueBreakdown(days).then(r => r.data?.data),
  })

  const { data: topProducts, isLoading: topLoading } = useQuery({
    queryKey: ['analytics', 'dashboard', 'top-products', topBy, days],
    queryFn: () => analyticsService.getDashboardTopProducts(10, topBy, days).then(r => r.data?.data),
  })

  const { data: monthly, isLoading: monthlyLoading } = useQuery({
    queryKey: ['analytics', 'dashboard', 'monthly'],
    queryFn: () => analyticsService.getMonthlyTrend(12).then(r => r.data?.data),
  })

  const { data: heatmap, isLoading: hmLoading } = useQuery({
    queryKey: ['analytics', 'dashboard', 'heatmap'],
    queryFn: () => analyticsService.getSalesHeatmap(90).then(r => r.data?.data),
  })

  const stockStatus = summary?.stock_status || {}
  const totalTracked = Object.values(stockStatus).reduce((a, b) => a + b, 0)

  const statusPieData = Object.entries(stockStatus).map(([k, v]) => ({
    name: k.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
    value: v,
  }))
  const statusColors = ['#22C55E','#F59E0B','#EF4444','#DC2626','#6366F1']

  // Heatmap grid: days 1-7 × hours 0-23
  const hmLookup = {}
  ;(heatmap || []).forEach(r => { hmLookup[`${r.day_of_week}-${r.hour}`] = r.orders })
  const hmMax = Math.max(...Object.values(hmLookup), 1)
  const DOW_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI label="Revenue (30d)"    value={formatRs(summary?.revenue_30d)}        color="#2563EB" loading={sumLoading} />
        <KPI label="Revenue (7d)"     value={formatRs(summary?.revenue_7d)}          color="#22C55E" loading={sumLoading} />
        <KPI label="Growth vs Prev"   value={pct(summary?.revenue_growth_pct)}       color={summary?.revenue_growth_pct >= 0 ? '#22C55E' : '#EF4444'} loading={sumLoading} />
        <KPI label="Transactions"     value={formatNumber(summary?.total_transactions_30d)} color="#8B5CF6" loading={sumLoading} />
        <KPI label="Avg Order Value"  value={formatRs(summary?.avg_order_value_30d)} color="#F59E0B" loading={sumLoading} />
        <KPI label="Unread Alerts"    value={formatNumber(summary?.unread_alerts)}    color="#EF4444" loading={sumLoading} />
      </div>

      {/* Revenue trend */}
      <ChartCard
        title="Revenue Trend"
        subtitle={`Daily revenue and order volume`}
        loading={trendLoading}
        height={240}
        action={<SelectDays value={days} onChange={setDays} />}
      >
        <AreaChart
          data={trend || []}
          areas={[
            { key: 'revenue', label: 'Revenue (Rs.)', color: '#2563EB' },
            { key: 'orders',  label: 'Orders',        color: '#8B5CF6' },
          ]}
          xKey="date" height={240}
          formatXAxis={v => formatDate(v, 'MMM d')}
          formatYAxis={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
        />
      </ChartCard>

      {/* Revenue breakdown + stock health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Revenue by Category" subtitle={`Last ${days} days`} loading={bdLoading} height={280}>
          <PieChart
            data={(breakdown || []).map(d => ({ ...d, name: d.name || 'Unknown' }))}
            nameKey="name" valueKey="value" height={280} donut colors={PIE_COLORS}
          />
        </ChartCard>

        <ChartCard title="Stock Health Distribution" subtitle={`${totalTracked} total SKUs tracked`} loading={sumLoading} height={280}>
          <PieChart
            data={statusPieData} nameKey="name" valueKey="value"
            height={280} donut colors={statusColors}
          />
        </ChartCard>
      </div>

      {/* Top products */}
      <ChartCard
        title="Top Products"
        subtitle="Sorted by selected metric"
        loading={topLoading}
        height={260}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTopBy('revenue')}
              className="px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-all"
              style={{
                background: topBy === 'revenue' ? 'rgba(37,99,235,.12)' : 'transparent',
                color: topBy === 'revenue' ? '#2563EB' : 'var(--text-muted)',
                border: `1.5px solid ${topBy === 'revenue' ? '#2563EB' : 'var(--border)'}`,
              }}
            >Revenue</button>
            <button
              onClick={() => setTopBy('quantity')}
              className="px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-all"
              style={{
                background: topBy === 'quantity' ? 'rgba(139,92,246,.12)' : 'transparent',
                color: topBy === 'quantity' ? '#8B5CF6' : 'var(--text-muted)',
                border: `1.5px solid ${topBy === 'quantity' ? '#8B5CF6' : 'var(--border)'}`,
              }}
            >Quantity</button>
          </div>
        }
      >
        <BarChart
          data={(topProducts || []).map(d => ({
            ...d, name: d.name?.length > 14 ? d.name.slice(0, 14) + '…' : (d.name || `SKU ${d.sku_id}`),
          }))}
          bars={topBy === 'revenue'
            ? [{ key: 'revenue',  label: 'Revenue (Rs.)',  color: '#2563EB' }]
            : [{ key: 'quantity', label: 'Quantity (units)', color: '#8B5CF6' }]
          }
          xKey="name" height={260}
          formatYAxis={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
        />
      </ChartCard>

      {/* Monthly trend */}
      <ChartCard title="Monthly Revenue Trend" subtitle="Last 12 months" loading={monthlyLoading} height={240}>
        <BarChart
          data={(monthly || []).map(d => ({ ...d, label: d.label }))}
          bars={[
            { key: 'revenue',  label: 'Revenue (Rs.)', color: '#2563EB' },
            { key: 'quantity', label: 'Quantity',      color: '#22C55E' },
          ]}
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

  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ['analytics', 'inventory', 'summary'],
    queryFn: () => analyticsService.getInventorySummary().then(r => r.data?.data),
  })

  const { data: statusBreakdown, isLoading: sbLoading } = useQuery({
    queryKey: ['analytics', 'inventory', 'status'],
    queryFn: () => analyticsService.getInventoryStatusBreakdown().then(r => r.data?.data),
  })

  const { data: catStock, isLoading: catLoading } = useQuery({
    queryKey: ['analytics', 'inventory', 'category-stock'],
    queryFn: () => analyticsService.getCategoryStock().then(r => r.data?.data),
  })

  const { data: scatter, isLoading: scatterLoading } = useQuery({
    queryKey: ['analytics', 'inventory', 'risk-scatter'],
    queryFn: () => analyticsService.getRiskScatter(300).then(r => r.data?.data),
  })

  const { data: turnover, isLoading: toLoading } = useQuery({
    queryKey: ['analytics', 'inventory', 'turnover', turnoverDays],
    queryFn: () => analyticsService.getInventoryTurnover(turnoverDays).then(r => r.data?.data),
  })

  const { data: lowStock, isLoading: lsLoading } = useQuery({
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPI label="Total Units"      value={formatNumber(summary?.total_inventory_units, 0)}  color="#2563EB"  loading={sumLoading} />
        <KPI label="Inventory Value"  value={formatRs(summary?.total_inventory_value)}          color="#22C55E"  loading={sumLoading} />
        <KPI label="Avg Days Supply"  value={summary?.avg_days_of_supply != null ? `${formatNumber(summary.avg_days_of_supply, 0)} d` : '—'} color="#8B5CF6" loading={sumLoading} />
        <KPI label="High Stockout Risk" value={formatNumber(summary?.high_stockout_risk_items)} color="#EF4444"  loading={sumLoading} sub="≥50% risk" />
        <KPI label="Zero Stock Items" value={formatNumber(summary?.zero_stock_items)}            color="#DC2626"  loading={sumLoading} />
      </div>

      {/* Status breakdown + category stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Stock Status Distribution" subtitle="Current inventory health overview" loading={sbLoading} height={280}>
          <PieChart
            data={statusDisplayData}
            nameKey="name" valueKey="value" height={280} donut
            colors={statusColors.length ? statusColors : PIE_COLORS}
          />
        </ChartCard>

        <ChartCard title="Stock by Category" subtitle="Total units held per category" loading={catLoading} height={280}>
          <BarChart
            data={(catStock || []).map(d => ({ ...d, name: d.name?.length > 16 ? d.name.slice(0, 16) + '…' : d.name }))}
            bars={[{ key: 'total_value', label: 'Stock Value (Rs.)', color: '#2563EB' }]}
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
            : (
              <ResponsiveContainer width="100%" height={320}>
                <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
                  <XAxis
                    type="number" dataKey="x" name="Stockout Risk" domain={[0, 1]}
                    tickFormatter={v => `${(v * 100).toFixed(0)}%`}
                    tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                    label={{ value: 'Stockout Risk →', position: 'insideBottom', offset: -12, fontSize: 11, fill: '#9ca3af' }}
                  />
                  <YAxis
                    type="number" dataKey="y" name="Overstock Risk" domain={[0, 1]}
                    tickFormatter={v => `${(v * 100).toFixed(0)}%`}
                    tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={46}
                    label={{ value: 'Overstock Risk →', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#9ca3af' }}
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
        height={240}
        action={<SelectDays value={turnoverDays} onChange={setTurnoverDays} />}
      >
        <BarChart
          data={(turnover || []).map(d => ({ ...d, name: d.name?.length > 14 ? d.name.slice(0, 14) + '…' : d.name }))}
          bars={[{ key: 'turnover_rate', label: 'Turnover Rate (×/yr)', color: '#22C55E' }]}
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
        </CardHeader>
        <CardContent style={{ padding: 0 }}>
          {lsLoading
            ? <div className="p-4"><SkeletonChart height={200} /></div>
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
                              style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
                              {item.status?.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="text-right num">{formatNumber(item.current_stock, 1)}</td>
                          <td className="text-right num" style={{ color: '#F59E0B' }}>{formatNumber(item.reorder_point, 0)}</td>
                          <td className="text-right num" style={{ color: '#2563EB' }}>{formatNumber(item.safety_stock, 0)}</td>
                          <td className="text-right num font-semibold" style={{ color: '#EF4444' }}>
                            {item.recommended_order_qty > 0 ? formatNumber(item.recommended_order_qty) : '—'}
                          </td>
                          <td className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="progress-micro w-14">
                                <div className="progress-micro-fill"
                                  style={{ width: `${riskPct}%`, background: parseFloat(riskPct) > 70 ? '#EF4444' : parseFloat(riskPct) > 40 ? '#F59E0B' : '#22C55E' }} />
                              </div>
                              <span className="num text-[12px] font-semibold w-10 text-right"
                                style={{ color: parseFloat(riskPct) > 70 ? '#EF4444' : parseFloat(riskPct) > 40 ? '#F59E0B' : '#22C55E' }}>
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

  const { data: accuracy, isLoading: accLoading } = useQuery({
    queryKey: ['analytics', 'forecast', 'accuracy'],
    queryFn: () => analyticsService.getForecastAccuracy().then(r => r.data?.data),
  })

  const { data: coverage, isLoading: covLoading } = useQuery({
    queryKey: ['analytics', 'forecast', 'coverage'],
    queryFn: () => analyticsService.getModelCoverage().then(r => r.data?.data),
  })

  const { data: demandCat, isLoading: dcLoading } = useQuery({
    queryKey: ['analytics', 'forecast', 'by-category', catDays],
    queryFn: () => analyticsService.getDemandByCategory(catDays).then(r => r.data?.data),
  })

  // Lazy SKU list for demand-vs-actual selector
  const { data: skuList } = useQuery({
    queryKey: ['inventory', 'sku-list'],
    queryFn: () => inventoryService.getProducts({ page: 1, size: 200 }).then(r => r.data?.data || []),
    staleTime: 10 * 60_000,
  })

  const { data: dvActual, isLoading: dvaLoading } = useQuery({
    queryKey: ['analytics', 'forecast', 'demand-vs-actual', selectedSku, forecastDays],
    queryFn: () => analyticsService.getDemandVsActual(selectedSku, forecastDays).then(r => r.data?.data),
    enabled: !!selectedSku,
  })

  const MODEL_COLORS = { Prophet: '#8B5CF6', 'Random Forest': '#22C55E', LSTM: '#EF4444' }

  return (
    <div className="space-y-5">
      {/* Accuracy comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Model Accuracy Comparison" subtitle="Average MAPE (%) per model — lower is better" loading={accLoading} height={260}>
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
                  bars={[
                    { key: 'avg_mae',  label: 'MAE',  color: '#2563EB' },
                    { key: 'avg_rmse', label: 'RMSE', color: '#F59E0B' },
                  ]}
                  xKey="model" height={180}
                />
              </>
            )
          }
        </ChartCard>

        <ChartCard title="Model Coverage" subtitle="SKUs with a trained model" loading={covLoading} height={260}>
          <PieChart
            data={(coverage?.chart_data || []).filter(d => d.value > 0)}
            nameKey="name" valueKey="value" height={260} donut
            colors={['#8B5CF6', '#22C55E', '#EF4444', '#94A3B8']}
          />
        </ChartCard>
      </div>

      {/* Demand by category */}
      <ChartCard
        title="Forecast Demand by Category"
        subtitle="Aggregated predicted demand per model type"
        loading={dcLoading}
        height={260}
        action={<SelectDays value={catDays} onChange={setCatDays} />}
      >
        {!(demandCat?.length)
          ? <EmptyState icon={TrendingUp} title="No forecast data" description="Generate forecasts to see demand by category." />
          : (
            <BarChart
              data={(demandCat || []).map(d => ({ ...d, name: d.name?.length > 14 ? d.name.slice(0, 14) + '…' : d.name }))}
              bars={[
                { key: 'prophet', label: 'Prophet',       color: '#8B5CF6' },
                { key: 'rf',      label: 'Random Forest', color: '#22C55E' },
                { key: 'lstm',    label: 'LSTM',           color: '#EF4444' },
              ]}
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
                  lines={[
                    { key: 'actual',   label: 'Actual',   color: '#2563EB' },
                    { key: 'forecast', label: 'Forecast', color: '#8B5CF6' },
                  ]}
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

  const { data: catPerf, isLoading: cpLoading } = useQuery({
    queryKey: ['analytics', 'product', 'category-performance', catDays],
    queryFn: () => analyticsService.getCategoryPerformance(catDays).then(r => r.data?.data),
  })

  const { data: velocity, isLoading: velLoading } = useQuery({
    queryKey: ['analytics', 'product', 'velocity', velDays],
    queryFn: () => analyticsService.getVelocityRanking(20, velDays).then(r => r.data?.data),
  })

  const { data: comparison, isLoading: compLoading } = useQuery({
    queryKey: ['analytics', 'product', 'period-comparison', compDays],
    queryFn: () => analyticsService.getPeriodComparison(compDays).then(r => r.data?.data),
  })

  const { data: prices, isLoading: pricesLoading } = useQuery({
    queryKey: ['analytics', 'product', 'price-trends', priceDays],
    queryFn: () => analyticsService.getPriceTrends(priceDays).then(r => r.data?.data),
  })

  const { data: skuTrend, isLoading: skuTrendLoading } = useQuery({
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
  const catColors = ['#2563EB','#22C55E','#F59E0B','#EF4444','#8B5CF6','#06B6D4']

  return (
    <div className="space-y-5">
      {/* Category performance table + bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Category Revenue Performance"
          subtitle="Revenue, transactions, and growth breakdown"
          loading={cpLoading}
          height={300}
          action={<SelectDays value={catDays} onChange={setCatDays} />}
        >
          <BarChart
            data={(catPerf || []).map(d => ({ ...d, name: d.name?.length > 14 ? d.name.slice(0, 14) + '…' : d.name }))}
            bars={[{ key: 'revenue', label: 'Revenue (Rs.)', color: '#2563EB' }]}
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
          </CardHeader>
          <CardContent style={{ padding: 0 }}>
            {cpLoading
              ? <div className="p-4"><SkeletonChart height={260} /></div>
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
        height={280}
        action={<SelectDays value={velDays} onChange={setVelDays} />}
      >
        <BarChart
          data={(velocity || []).map(d => ({
            ...d,
            name: d.name?.length > 14 ? d.name.slice(0, 14) + '…' : (d.name || `SKU ${d.sku_id}`),
          }))}
          bars={[{ key: 'velocity_per_day', label: 'Units/day', color: '#22C55E' }]}
          xKey="name" height={280} horizontal
        />
      </ChartCard>

      {/* Period comparison */}
      <ChartCard
        title="Period-over-Period Revenue"
        subtitle={`This ${compDays}d vs previous ${compDays}d by category`}
        loading={compLoading}
        height={280}
        action={<SelectDays value={compDays} onChange={setCompDays} />}
      >
        <BarChart
          data={(comparison || []).map(d => ({ ...d, name: d.name?.length > 14 ? d.name.slice(0, 14) + '…' : d.name }))}
          bars={[
            { key: 'current_revenue',  label: `Current ${compDays}d`,  color: '#2563EB' },
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
              formatYAxis={v => `Rs.${v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}`}
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
            : !(skuTrend?.series?.length)
            ? <EmptyState icon={ShoppingBag} title="No sales data" description="No transactions found for this product in the selected period." />
            : (
              <AreaChart
                data={skuTrend.series}
                areas={[
                  { key: 'revenue',  label: 'Revenue (Rs.)', color: '#2563EB' },
                  { key: 'quantity', label: 'Quantity',       color: '#22C55E' },
                ]}
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
            <BarChart3 className="h-4 w-4" style={{ color: '#2563EB' }} />
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
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          <TabContent />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
