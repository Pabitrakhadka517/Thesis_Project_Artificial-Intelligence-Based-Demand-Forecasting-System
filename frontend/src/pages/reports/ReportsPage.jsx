import { useState, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  ScatterChart, Scatter, ZAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  LayoutDashboard, TrendingUp, ShoppingCart, Package, DollarSign,
  Truck, Activity, AlertTriangle, Clock, Target, Printer,
  FileSpreadsheet, FileText, ArrowUp, ArrowDown, Minus,
  Calendar, RefreshCw, Filter, BarChart2, CheckCircle, BarChart3,
  XCircle, ChevronUp, ChevronDown, Search, RotateCcw, Info, Zap,
  Brain, Sparkles, TrendingDown, Cpu,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { reportService } from '@/services/reportService'
import { analyticsService } from '@/services/analyticsService'
import axiosInstance from '@/api/axiosInstance'
import { formatCurrency, formatNumber, formatPercent, formatDate, exportCSV, getProductImage, imgFallback } from '@/utils'

// ── Palette ───────────────────────────────────────────────────────────────────
const PIE_COLORS = ['#3B82F6','#10B981','#F59E0B','#6366F1','#EC4899','#EF4444','#06B6D4','#84CC16','#F97316','#8B5CF6']

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS = [
  { key: 'executive',   label: 'Executive',       Icon: LayoutDashboard, color: '#6366F1' },
  { key: 'analytics',  label: 'Analytics',       Icon: BarChart3,       color: '#3B82F6' },
  { key: 'sales',      label: 'Sales',           Icon: TrendingUp,      color: '#2563EB' },
  { key: 'purchases',  label: 'Purchases',       Icon: ShoppingCart,    color: '#10B981' },
  { key: 'inventory',  label: 'Inventory',       Icon: Package,         color: '#F59E0B' },
  { key: 'profit',     label: 'Profit & Margin', Icon: DollarSign,      color: '#8B5CF6' },
  { key: 'suppliers',  label: 'Suppliers',       Icon: Truck,           color: '#EC4899' },
  { key: 'forecast',   label: 'Forecast',        Icon: Target,          color: '#06B6D4' },
  { key: 'ai-insights',label: 'AI Insights',     Icon: Brain,           color: '#8B5CF6' },
]

// ── Date presets ──────────────────────────────────────────────────────────────
const PRESETS = [
  { value: 'today',     label: 'Today'        },
  { value: 'yesterday', label: 'Yesterday'    },
  { value: '7',         label: 'Last 7D'      },
  { value: '30',        label: 'Last 30D'     },
  { value: 'month',     label: 'This Month'   },
  { value: 'lastMonth', label: 'Last Month'   },
  { value: 'quarter',   label: 'This Quarter' },
  { value: 'year',      label: 'This Year'    },
  { value: 'custom',    label: 'Custom'       },
]

const REPORT_SVC = {
  'executive':  reportService.getExecutiveReport,
  'sales':      reportService.getSalesReport,
  'purchases':  reportService.getPurchaseReport,
  'inventory':  reportService.getInventoryReport,
  'profit':     reportService.getProfitReport,
  'suppliers':  reportService.getSupplierReport,
  'forecast':   reportService.getForecastReport,
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function computeParams(preset, startDate, endDate, category, supplier) {
  const base = {
    category: category || undefined,
    supplier: supplier || undefined,
  }
  // All named periods — let backend compute date boundaries
  if (['today', 'yesterday', 'week', 'month', 'lastMonth', 'quarter', 'year'].includes(preset)) {
    return { ...base, period: preset }
  }
  if (preset === 'custom') {
    return { ...base, startDate: startDate || undefined, endDate: endDate || undefined }
  }
  // Numeric presets: '7', '30' → ?days=N
  return { ...base, days: parseInt(preset) }
}

// Maps the global preset to a numeric days value used by analyticsService
function presetToDays(preset) {
  const MAP = { today: 1, yesterday: 1, week: 7, month: 30, lastMonth: 30, quarter: 90, year: 365, '7': 7, '30': 30 }
  return MAP[preset] || 30
}

// ── Export helpers ────────────────────────────────────────────────────────────
function getExportRows(tab, data) {
  if (!data) return []
  switch (tab) {
    case 'executive': return [
      { Metric: 'Revenue',         Value: data.revenue        || 0, 'Growth%': data.revenueGrowth ?? '—' },
      { Metric: 'Gross Profit',    Value: data.profit         || 0, 'Growth%': data.profitGrowth  ?? '—' },
      { Metric: 'Purchase Spend',  Value: data.spend          || 0, 'Growth%': data.spendGrowth   ?? '—' },
      { Metric: 'Inventory Value', Value: data.inventoryValue || 0 },
      { Metric: 'Total Products',  Value: data.totalProducts  || 0 },
      { Metric: 'Low Stock',       Value: data.lowStock       || 0 },
      { Metric: 'Out of Stock',    Value: data.outOfStock     || 0 },
    ]
    case 'sales': return (data.topProducts || []).map(p => ({
      Product: p.name, Revenue: p.revenue, Quantity: p.qty,
    }))
    case 'purchases': return (data.topSuppliers || []).map(s => ({
      Supplier: s.name, Amount: s.amount, Orders: s.count,
    }))
    case 'inventory': return (data.lowStockProducts || []).map(p => ({
      Product: p.name, SKU: p.sku, Category: p.category, Supplier: p.supplier,
      'Current Stock': p.currentStock, 'Reorder Level': p.reorderLevel,
      Unit: p.unit, 'Stock Value': p.stockValue,
    }))
    case 'profit': return (data.topMarginProducts || []).map(p => ({
      Product: p.name, Revenue: p.revenue, COGS: p.cogs,
      Profit: p.profit, 'Margin%': p.margin?.toFixed(1), Qty: p.qty,
    }))
    case 'suppliers': return (data.suppliers || []).map(s => ({
      Supplier: s.name, Contact: s.contactPerson, Phone: s.phone,
      District: s.district, 'Lead Time(d)': s.leadTimeDays,
      Orders: s.totalOrders, Spend: s.totalSpend,
      Pending: s.pendingOrders, Status: s.status, Rating: s.rating,
    }))
    case 'forecast': return (data.predictions || []).map(p => ({
      Product: p.product?.name || '—',
      SKU: p.product?.sku || '—',
      'Current Stock': p.product?.currentStock ?? '—',
      'Reorder Level': p.product?.reorderLevel ?? '—',
      'Risk Level': p.inventoryRisk || '—',
      'Suggested Purchase': p.suggestedPurchase ?? '—',
      'Days of Stock': p.daysOfStock ?? '—',
      'Confidence (%)': p.confidenceScore != null ? p.confidenceScore.toFixed(1) : '—',
    }))
    default: return []
  }
}

function downloadExcel(rows, filename) {
  if (!rows?.length) return
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook  = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report')
  XLSX.writeFile(workbook, `${filename}.xlsx`)
}

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #report-print-area, #report-print-area * { visibility: visible !important; }
  #report-print-area {
    position: absolute; left: 0; top: 0; width: 100%;
    padding: 24px; background: #fff; color: #111;
  }
  .no-print { display: none !important; }
  .print-header { display: block !important; }
}
`

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Sk({ h = 'h-4', w = 'w-full', rounded = 'rounded' }) {
  return (
    <div className={`${h} ${w} ${rounded} animate-pulse`}
      style={{ background: 'var(--surface-muted)' }} />
  )
}

function SkCard() {
  return (
    <div className="rounded-xl p-5 space-y-3"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between">
        <Sk h="h-8" w="w-8" rounded="rounded-lg" />
        <Sk h="h-4" w="w-12" />
      </div>
      <Sk h="h-3" w="w-20" />
      <Sk h="h-7" w="w-32" />
      <Sk h="h-3" w="w-24" />
    </div>
  )
}

function ReportSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <SkCard key={i} />)}
      </div>
      <div className="rounded-xl p-5 space-y-3"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
        <Sk h="h-4" w="w-40" />
        <div className="mt-2">
          <Sk h="h-[220px]" rounded="rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {[1,2].map(i => (
          <div key={i} className="rounded-xl p-5 space-y-3"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
            <Sk h="h-4" w="w-32" />
            <Sk h="h-[180px]" rounded="rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Empty / Error states ──────────────────────────────────────────────────────
function EmptyState({ message = 'No data for this period', hint = 'Try adjusting your filters or date range.' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <BarChart2 className="w-12 h-12 opacity-25" style={{ color: 'var(--text-muted)' }} />
      <div className="text-center">
        <p className="font-semibold text-[15px]" style={{ color: 'var(--text-primary)' }}>{message}</p>
        <p className="text-[13px] mt-1.5" style={{ color: 'var(--text-muted)' }}>{hint}</p>
      </div>
    </div>
  )
}

function ErrorState({ onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <XCircle className="w-12 h-12 opacity-40" style={{ color: '#EF4444' }} />
      <div className="text-center">
        <p className="font-semibold text-[15px]" style={{ color: 'var(--text-primary)' }}>Failed to load report</p>
        <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>Could not fetch data from the server.</p>
      </div>
      <button onClick={onRetry}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
        <RotateCcw className="w-3.5 h-3.5" /> Retry
      </button>
    </div>
  )
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function KpiCard({ Icon, label, value, sub, color = '#6366F1', growth }) {
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
      <div style={{ height: 3, background: `linear-gradient(90deg,${color},${color}44)` }} />
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: `${color}18` }}>
            <Icon className="w-4.5 h-4.5" style={{ color }} />
          </div>
          {growth != null && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-0.5"
              style={{
                color:      growth > 0 ? '#10B981' : growth < 0 ? '#EF4444' : 'var(--text-muted)',
                background: growth > 0 ? 'rgba(16,185,129,.12)' : growth < 0 ? 'rgba(239,68,68,.12)' : 'var(--surface-muted)',
              }}>
              {growth > 0 ? <ArrowUp className="w-2.5 h-2.5" />
                : growth < 0 ? <ArrowDown className="w-2.5 h-2.5" />
                : <Minus className="w-2.5 h-2.5" />}
              {Math.abs(growth)}%
            </span>
          )}
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1"
          style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-[22px] font-bold leading-none" style={{ color }}>{value}</p>
        {sub && <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
    </div>
  )
}

const ChartTooltip = ({ active, payload, label, currency }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl p-3 shadow-xl text-[12px]"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
      {label != null && (
        <p className="font-semibold mb-2 pb-1.5 border-b" style={{ color: 'var(--text-primary)', borderColor: 'var(--border)' }}>
          {label}
        </p>
      )}
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 mt-1">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.stroke }} />
          <span style={{ color: 'var(--text-muted)' }}>{p.name}:</span>
          <span className="font-semibold ml-auto" style={{ color: 'var(--text-primary)' }}>
            {currency ? formatCurrency(p.value) : formatNumber(p.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

function SectionCard({ title, subtitle, action, children }) {
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
      {title && (
        <div className="px-5 py-3.5 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--border)' }}>
          <div>
            <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
            {subtitle && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── DataTable with pagination + sort + search ─────────────────────────────────
function DataTable({
  columns, rows, emptyMsg = 'No data',
  pageSize = 20, searchable = false, searchPlaceholder = 'Search…',
}) {
  const [page,      setPage]      = useState(1)
  const [sortKey,   setSortKey]   = useState(null)
  const [sortDir,   setSortDir]   = useState('asc')
  const [query,     setQuery]     = useState('')

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return rows || []
    const q = query.toLowerCase()
    return (rows || []).filter(r =>
      columns.some(c => String(r[c.key] ?? '').toLowerCase().includes(q))
    )
  }, [rows, query, searchable, columns])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paged      = sorted.slice((page - 1) * pageSize, page * pageSize)

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  return (
    <div className="space-y-3">
      {searchable && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text" value={query} onChange={e => { setQuery(e.target.value); setPage(1) }}
            placeholder={searchPlaceholder}
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          {query && (
            <button onClick={() => { setQuery(''); setPage(1) }}>
              <XCircle className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr style={{ background: 'var(--surface-muted)' }}>
              {columns.map(c => (
                <th key={c.key + (c.label||'')}
                  className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider select-none"
                  style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', cursor: c.sortable !== false ? 'pointer' : 'default' }}
                  onClick={() => c.sortable !== false && toggleSort(c.key)}>
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {sortKey === c.key && (
                      sortDir === 'asc'
                        ? <ChevronUp className="w-3 h-3" />
                        : <ChevronDown className="w-3 h-3" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!paged.length ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center"
                  style={{ color: 'var(--text-muted)' }}>{emptyMsg}</td>
              </tr>
            ) : paged.map((row, i) => (
              <tr key={i} className="border-t transition-colors"
                style={{ borderColor: 'var(--border)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                {columns.map(c => (
                  <td key={c.key + (c.label||'')} className="px-3 py-2.5"
                    style={{ color: c.muted ? 'var(--text-muted)' : 'var(--text-primary)', whiteSpace: c.noWrap ? 'nowrap' : undefined }}>
                    {c.render ? c.render(row[c.key], row) : (row[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            {sorted.length} rows · page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <PagBtn disabled={page <= 1}         onClick={() => setPage(1)}          label="«" />
            <PagBtn disabled={page <= 1}         onClick={() => setPage(p => p - 1)} label="‹" />
            <PagBtn disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} label="›" />
            <PagBtn disabled={page >= totalPages} onClick={() => setPage(totalPages)} label="»" />
          </div>
        </div>
      )}
    </div>
  )
}

function PagBtn({ label, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="w-7 h-7 flex items-center justify-center rounded text-[12px] font-medium disabled:opacity-30"
      style={{ background: 'var(--surface-muted)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
      {label}
    </button>
  )
}

// ── Stat row (used inside SectionCards) ───────────────────────────────────────
function StatRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0"
      style={{ borderColor: 'var(--border)' }}>
      <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-[13px] font-semibold" style={{ color: color || 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

// ── Risk badge ────────────────────────────────────────────────────────────────
const RISK_STYLE = {
  high:   { color: '#EF4444', bg: 'rgba(239,68,68,.12)'  },
  medium: { color: '#F59E0B', bg: 'rgba(245,158,11,.12)' },
  low:    { color: '#10B981', bg: 'rgba(16,185,129,.12)' },
}
function RiskBadge({ v }) {
  const s = RISK_STYLE[v] || {}
  return (
    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase"
      style={{ background: s.bg, color: s.color }}>{v || '—'}</span>
  )
}

// ── Print header ──────────────────────────────────────────────────────────────
function PrintHeader({ company, tabLabel, preset }) {
  return (
    <div className="print-header" style={{ display: 'none', borderBottom: '2px solid #000', paddingBottom: 12, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{company?.companyName || 'StockWise'}</h1>
          {company?.companyAddress && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#555' }}>{company.companyAddress}</p>}
          {company?.companyPhone   && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#555' }}>Tel: {company.companyPhone}</p>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#333' }}>{tabLabel} Report</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#555' }}>
            Period: {PRESETS.find(p => p.value === preset)?.label || preset}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#555' }}>
            Generated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORT PANELS
// ══════════════════════════════════════════════════════════════════════════════

// ── Executive ─────────────────────────────────────────────────────────────────
function ExecutiveReport({ data }) {
  if (!data) return <EmptyState />
  const { revenue=0, profit=0, spend=0, inventoryValue=0,
    totalProducts=0, outOfStock=0, lowStock=0, orders=0,
    revenueGrowth, profitGrowth, spendGrowth, margin=0,
    topProducts=[], topSuppliers=[] } = data

  const kpis = [
    { Icon: TrendingUp,   label: 'Total Revenue',    value: formatCurrency(revenue),        sub: `${formatNumber(orders)} orders`,          color: '#3B82F6', growth: revenueGrowth },
    { Icon: DollarSign,   label: 'Gross Profit',     value: formatCurrency(profit),          sub: `${formatPercent(margin)} margin`,          color: '#10B981', growth: profitGrowth  },
    { Icon: ShoppingCart, label: 'Purchase Spend',   value: formatCurrency(spend),           sub: undefined,                                  color: '#F59E0B', growth: spendGrowth   },
    { Icon: Package,      label: 'Inventory Value',  value: formatCurrency(inventoryValue),  sub: `${formatNumber(totalProducts)} products`,  color: '#6366F1' },
  ]
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* Stock alert mini-cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { Icon: CheckCircle,  label: 'Total Products', value: formatNumber(totalProducts), color: '#10B981' },
          { Icon: AlertTriangle,label: 'Low Stock',      value: formatNumber(lowStock),      color: '#F59E0B' },
          { Icon: XCircle,      label: 'Out of Stock',   value: formatNumber(outOfStock),    color: '#EF4444' },
        ].map(({ Icon, label, value, color }) => (
          <div key={label} className="rounded-xl p-4 flex items-center gap-3"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: `${color}18` }}>
              <Icon className="w-4.5 h-4.5" style={{ color }} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{label}</p>
              <p className="text-[18px] font-bold" style={{ color }}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Top Products by Revenue">
          {topProducts.length === 0 ? <EmptyState message="No sales data" hint="" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topProducts} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} width={100} />
                <Tooltip content={<ChartTooltip currency />} />
                <Bar dataKey="revenue" name="Revenue" fill="#3B82F6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
        <SectionCard title="Top Suppliers by Spend">
          {topSuppliers.length === 0 ? <EmptyState message="No purchase data" hint="" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topSuppliers} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} width={100} />
                <Tooltip content={<ChartTooltip currency />} />
                <Bar dataKey="amount" name="Spend" fill="#10B981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>
    </div>
  )
}

// ── Sales ─────────────────────────────────────────────────────────────────────
function SalesReport({ data }) {
  if (!data) return <EmptyState />
  const { totalRevenue=0, totalOrders=0, avgOrderValue=0, totalItemsSold=0,
    totalDiscount=0, trend=[], topProducts=[], byPaymentMethod=[], byCategory=[] } = data

  const PM_LABELS = { cash: 'Cash', card: 'Card', qr: 'QR Pay', credit: 'Credit' }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard Icon={TrendingUp}   label="Total Revenue"    value={formatCurrency(totalRevenue)}  color="#3B82F6" />
        <KpiCard Icon={ShoppingCart} label="Total Orders"     value={formatNumber(totalOrders)}     color="#10B981" />
        <KpiCard Icon={DollarSign}   label="Avg Order Value"  value={formatCurrency(avgOrderValue)} color="#F59E0B" />
        <KpiCard Icon={Package}      label="Items Sold"       value={formatNumber(totalItemsSold)}  color="#6366F1"
          sub={totalDiscount > 0 ? `${formatCurrency(totalDiscount)} discounts` : undefined} />
      </div>

      <SectionCard title="Revenue Trend" subtitle="Daily revenue and order count">
        {trend.length === 0 ? <EmptyState message="No sales in this period" hint="Try a wider date range." /> : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={trend} margin={{ top: 5, right: 20, bottom: 0, left: 10 }}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                tickFormatter={d => d?.slice(5)} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => formatCurrency(v)} />
              <Tooltip content={<ChartTooltip currency />} />
              <Area dataKey="revenue" name="Revenue" stroke="#3B82F6" strokeWidth={2} fill="url(#salesGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Top Products by Revenue">
          <DataTable
            columns={[
              { key: 'name',    label: 'Product' },
              { key: 'revenue', label: 'Revenue', render: v => formatCurrency(v), noWrap: true },
              { key: 'qty',     label: 'Qty',     render: v => formatNumber(v),   noWrap: true, muted: true },
            ]}
            rows={topProducts}
            emptyMsg="No sales data"
          />
        </SectionCard>

        <SectionCard title="By Payment Method">
          {byPaymentMethod.length === 0 ? <EmptyState message="No payment data" hint="" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byPaymentMethod} dataKey="amount" nameKey="method"
                  cx="50%" cy="45%" outerRadius={90} paddingAngle={3}
                  label={({ method, percent }) => `${PM_LABELS[method] || method} ${(percent*100).toFixed(0)}%`}
                  labelLine={false}>
                  {byPaymentMethod.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, _, { payload }) => [formatCurrency(v), PM_LABELS[payload?.method] || payload?.method]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      {/* Category Performance */}
      {byCategory.length > 0 && (
        <SectionCard title="Category Performance" subtitle="Revenue contribution by product category">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byCategory.slice(0, 8)} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} width={90} />
                <Tooltip content={<ChartTooltip currency />} />
                <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]}>
                  {byCategory.slice(0, 8).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <DataTable
              columns={[
                { key: 'name',    label: 'Category' },
                { key: 'revenue', label: 'Revenue', render: v => formatCurrency(v), noWrap: true },
                { key: 'qty',     label: 'Qty',     render: v => formatNumber(v),   noWrap: true, muted: true },
                { key: 'orders',  label: 'Orders',  render: v => formatNumber(v),   noWrap: true, muted: true },
              ]}
              rows={byCategory}
            />
          </div>
        </SectionCard>
      )}
    </div>
  )
}

// ── Purchases ─────────────────────────────────────────────────────────────────
function PurchasesReport({ data }) {
  if (!data) return <EmptyState />
  const { totalSpent=0, totalOrders=0, avgOrderValue=0,
    receivedOrders=0, pendingOrders=0,
    trend=[], topSuppliers=[], byPaymentStatus=[], byStatus=[] } = data

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard Icon={DollarSign}   label="Total Spent"     value={formatCurrency(totalSpent)}    color="#10B981" />
        <KpiCard Icon={ShoppingCart} label="Total Orders"    value={formatNumber(totalOrders)}     color="#3B82F6" />
        <KpiCard Icon={BarChart2}    label="Avg Order Value" value={formatCurrency(avgOrderValue)} color="#F59E0B" />
        <KpiCard Icon={Clock}        label="Pending Orders"  value={formatNumber(pendingOrders)}   color="#F97316"
          sub={receivedOrders > 0 ? `${formatNumber(receivedOrders)} received` : undefined} />
      </div>

      <SectionCard title="Purchase Trend" subtitle="Received purchase orders by day">
        {trend.length === 0 ? <EmptyState message="No received orders in this period" hint="Try a wider date range." /> : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={trend} margin={{ top: 5, right: 20, bottom: 0, left: 10 }}>
              <defs>
                <linearGradient id="purchGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10B981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={d => d?.slice(5)} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => formatCurrency(v)} />
              <Tooltip content={<ChartTooltip currency />} />
              <Area dataKey="amount" name="Purchases" stroke="#10B981" strokeWidth={2} fill="url(#purchGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Top Suppliers">
          <DataTable
            columns={[
              { key: 'name',   label: 'Supplier' },
              { key: 'amount', label: 'Amount', render: v => formatCurrency(v), noWrap: true },
              { key: 'count',  label: 'Orders', render: v => formatNumber(v),   noWrap: true, muted: true },
            ]}
            rows={topSuppliers}
            emptyMsg="No purchase data"
          />
        </SectionCard>

        <div className="grid grid-rows-2 gap-5">
          <SectionCard title="By Payment Status">
            <div className="space-y-1">
              {byPaymentStatus.map(s => (
                <StatRow key={s.status}
                  label={s.status ? s.status.charAt(0).toUpperCase() + s.status.slice(1) : '—'}
                  value={`${formatCurrency(s.amount)} (${formatNumber(s.count)})`}
                  color={s.status === 'paid' ? '#10B981' : s.status === 'pending' ? '#EF4444' : '#F59E0B'}
                />
              ))}
              {byPaymentStatus.length === 0 && <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No data</p>}
            </div>
          </SectionCard>

          <SectionCard title="By Order Status">
            <div className="space-y-1">
              {byStatus.map(s => (
                <StatRow key={s.status}
                  label={s.status ? s.status.charAt(0).toUpperCase() + s.status.slice(1) : '—'}
                  value={`${formatCurrency(s.amount)} (${formatNumber(s.count)})`}
                  color={s.status === 'received' ? '#10B981' : s.status === 'cancelled' ? '#EF4444' : '#F59E0B'}
                />
              ))}
              {byStatus.length === 0 && <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No data</p>}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

// ── Inventory ─────────────────────────────────────────────────────────────────
function InventoryReport({ data }) {
  if (!data) return <EmptyState />
  const { totalProducts=0, totalValue=0, outOfStock=0, critical=0, overstock=0, healthy=0,
    byCategory=[], bySupplier=[], lowStockProducts=[], movementSummary=[], inventoryTurnover } = data

  const statusData = [
    { name: 'Healthy',      value: healthy,   color: '#10B981' },
    { name: 'Critical',     value: critical,  color: '#F59E0B' },
    { name: 'Out of Stock', value: outOfStock,color: '#EF4444' },
    { name: 'Overstock',    value: overstock, color: '#6366F1' },
  ].filter(s => s.value > 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard Icon={Package}       label="Total Products"   value={formatNumber(totalProducts)} color="#6366F1" />
        <KpiCard Icon={DollarSign}    label="Inventory Value"  value={formatCurrency(totalValue)}  color="#3B82F6" />
        <KpiCard Icon={AlertTriangle} label="Critical Stock"   value={formatNumber(critical)}      color="#F59E0B"
          sub={`${formatNumber(outOfStock)} out of stock`} />
        <KpiCard Icon={Activity}      label="Turnover Rate"
          value={inventoryTurnover != null ? formatNumber(inventoryTurnover, 2) + '×' : '—'}
          sub="COGS / Inventory Value"
          color="#10B981" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Stock Status Distribution">
          {statusData.length === 0 ? <EmptyState message="No inventory data" hint="" /> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name"
                  cx="50%" cy="45%" outerRadius={95} paddingAngle={3}
                  label={({ name, percent }) => percent > 0.04 ? `${(percent*100).toFixed(0)}%` : null}>
                  {statusData.map(s => <Cell key={s.name} fill={s.color} />)}
                </Pie>
                <Legend formatter={(v, { color }) => <span style={{ color: 'var(--text-primary)', fontSize: 12 }}>{v}</span>} />
                <Tooltip formatter={(v, n) => [formatNumber(v), n]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Value by Category">
          {byCategory.length === 0 ? <EmptyState message="No category data" hint="" /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byCategory.slice(0, 8)} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} width={90} />
                <Tooltip content={<ChartTooltip currency />} />
                <Bar dataKey="value" name="Value" radius={[0, 4, 4, 0]}>
                  {byCategory.slice(0, 8).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      {/* Stock movement summary */}
      {movementSummary.length > 0 && (
        <SectionCard title="Stock Movement Summary" subtitle="All movements in the selected period">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {movementSummary.map(m => {
              const TYPE_CFG = {
                purchase:   { color: '#10B981', Icon: Package },
                sale:       { color: '#3B82F6', Icon: TrendingUp },
                adjustment: { color: '#F59E0B', Icon: BarChart2 },
                return:     { color: '#6366F1', Icon: RotateCcw },
                waste:      { color: '#EF4444', Icon: XCircle },
                transfer:   { color: '#EC4899', Icon: Truck },
              }
              const cfg = TYPE_CFG[m.type] || { color: '#6B7280', Icon: Info }
              return (
                <div key={m.type} className="rounded-lg p-3 text-center"
                  style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: cfg.color }}>
                    {m.type}
                  </p>
                  <p className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>{formatNumber(m.count)}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{formatNumber(m.totalUnits)} units</p>
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Low Stock Products" subtitle="Products at or below reorder level">
        <DataTable
          searchable
          searchPlaceholder="Search products…"
          columns={[
            { key: 'name', label: 'Product', render: (v, r) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
                  background: 'var(--surface-muted)' }}>
                  <img src={getProductImage(r)} alt={v}
                    style={{ width: 28, height: 28, objectFit: 'cover' }} onError={imgFallback} />
                </div>
                <span>{v}</span>
              </div>
            )},
            { key: 'sku',          label: 'SKU',           muted: true },
            { key: 'category',     label: 'Category',      muted: true },
            { key: 'supplier',     label: 'Supplier',      muted: true },
            { key: 'currentStock', label: 'Stock',
              render: (v, r) => `${formatNumber(v)} ${r.unit || ''}`, noWrap: true },
            { key: 'reorderLevel', label: 'Reorder',       render: v => formatNumber(v), noWrap: true, muted: true },
            { key: 'stockValue',   label: 'Value',         render: v => formatCurrency(v), noWrap: true },
          ]}
          rows={lowStockProducts}
          emptyMsg="No low stock products"
        />
      </SectionCard>
    </div>
  )
}

// ── Profit & Margin ───────────────────────────────────────────────────────────
function ProfitReport({ data }) {
  if (!data) return <EmptyState />
  const { revenue=0, cogs=0, profit=0, margin=0, trend=[], topMarginProducts=[] } = data

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard Icon={DollarSign}   label="Gross Profit"  value={formatCurrency(profit)}   color="#10B981" sub={`${formatPercent(margin)} margin`} />
        <KpiCard Icon={TrendingUp}   label="Revenue"       value={formatCurrency(revenue)}  color="#3B82F6" />
        <KpiCard Icon={ShoppingCart} label="COGS"          value={formatCurrency(cogs)}     color="#F59E0B" />
        <KpiCard Icon={BarChart2}    label="Margin %"      value={formatPercent(margin)}    color="#8B5CF6"
          sub={profit < 0 ? 'Operating at loss' : profit === 0 ? 'Break-even' : undefined} />
      </div>

      <SectionCard title="Revenue vs Profit Trend">
        {trend.length === 0 ? <EmptyState message="No data for this period" hint="Try a wider date range." /> : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend} margin={{ top: 5, right: 20, bottom: 0, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={d => d?.slice(5)} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => formatCurrency(v)} />
              <Tooltip content={<ChartTooltip currency />} />
              <Legend />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#3B82F6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="profit"  name="Profit"  stroke="#10B981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="cogs"    name="COGS"    stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      <SectionCard title="Top Products by Margin">
        <DataTable
          columns={[
            { key: 'name',    label: 'Product' },
            { key: 'revenue', label: 'Revenue', render: v => formatCurrency(v), noWrap: true },
            { key: 'cogs',    label: 'COGS',    render: v => formatCurrency(v), noWrap: true, muted: true },
            { key: 'profit',  label: 'Profit',  render: v => formatCurrency(v), noWrap: true },
            { key: 'margin',  label: 'Margin %', render: v => (
              <span className="font-semibold" style={{ color: v >= 30 ? '#10B981' : v >= 15 ? '#F59E0B' : '#EF4444' }}>
                {formatPercent(v)}
              </span>
            ), noWrap: true },
            { key: 'qty', label: 'Qty', render: v => formatNumber(v), muted: true },
          ]}
          rows={topMarginProducts}
          emptyMsg="No profit data"
        />
      </SectionCard>
    </div>
  )
}

// ── Suppliers ─────────────────────────────────────────────────────────────────
function SuppliersReport({ data }) {
  if (!data) return <EmptyState />
  const suppliers = data.suppliers || []
  const { totalSpend = 0, activeCount = 0, avgLeadTime = 0 } = data.summary || {}

  const chartData = [...suppliers].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 8)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard Icon={Truck}        label="Total Suppliers" value={formatNumber(suppliers.length)} color="#EC4899" />
        <KpiCard Icon={DollarSign}   label="Total Spend"     value={formatCurrency(totalSpend)}     color="#3B82F6" />
        <KpiCard Icon={CheckCircle}  label="Active"          value={formatNumber(activeCount)}      color="#10B981" />
        <KpiCard Icon={Clock}        label="Avg Lead Time"   value={`${avgLeadTime}d`}              color="#F59E0B" />
      </div>

      <SectionCard title="Spend by Supplier">
        {chartData.length === 0 ? <EmptyState message="No purchase data in this period" hint="" /> : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} width={100} />
              <Tooltip content={<ChartTooltip currency />} />
              <Bar dataKey="totalSpend" name="Spend" radius={[0, 4, 4, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      <SectionCard title="Supplier Details">
        <DataTable
          searchable
          searchPlaceholder="Search suppliers…"
          columns={[
            { key: 'name',          label: 'Supplier' },
            { key: 'contactPerson', label: 'Contact',     muted: true },
            { key: 'phone',         label: 'Phone',       muted: true },
            { key: 'district',      label: 'District',    muted: true },
            { key: 'totalOrders',   label: 'Orders',      render: v => formatNumber(v),     noWrap: true },
            { key: 'totalSpend',    label: 'Spend',       render: v => formatCurrency(v),   noWrap: true },
            { key: 'pendingOrders', label: 'Pending',     render: v => formatNumber(v),     noWrap: true, muted: true },
            { key: 'avgDeliveryDays', label: 'Avg Del.(d)',render: v => v != null ? `${Math.round(v)}d` : '—', noWrap: true, muted: true },
            { key: 'leadTimeDays',  label: 'Lead(d)',     render: v => v ? `${v}d` : '—',  noWrap: true, muted: true },
            { key: 'status',        label: 'Status',      render: v => (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase"
                style={{ background: v === 'active' ? 'rgba(16,185,129,.15)' : 'rgba(239,68,68,.15)',
                         color: v === 'active' ? '#10B981' : '#EF4444' }}>
                {v}
              </span>
            ), noWrap: true },
          ]}
          rows={suppliers}
          emptyMsg="No supplier data"
        />
      </SectionCard>
    </div>
  )
}

// ── Forecast ──────────────────────────────────────────────────────────────────
function ForecastReport({ data }) {
  if (!data) return <EmptyState />
  const { predictions = [], summary = {}, riskDistribution = [], modelAccuracy = [], hasAiData, hasMlData } = data

  const RISK_COLOR = { high: '#EF4444', medium: '#F59E0B', low: '#10B981' }

  return (
    <div className="space-y-5">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard Icon={Target}        label="SKUs Forecasted"   value={formatNumber(summary.total)}             color="#06B6D4" />
        <KpiCard Icon={AlertTriangle} label="High Risk Items"   value={formatNumber(summary.highRisk)}          color="#EF4444"
          sub={`${formatNumber(summary.mediumRisk)} medium risk`} />
        <KpiCard Icon={ShoppingCart}  label="Total Suggested Buy" value={formatNumber(summary.totalSuggestedBuy)} color="#10B981" />
        <KpiCard Icon={Activity}      label="Avg MAPE"
          value={summary.avgMape != null ? `${summary.avgMape}%` : '—'}
          sub={summary.avgConfidence != null ? `${summary.avgConfidence}% confidence` : undefined}
          color="#8B5CF6" />
      </div>

      {/* Risk distribution + ML model accuracy */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Inventory Risk Distribution" subtitle="Forecast-derived risk categories">
          {riskDistribution.length === 0 ? (
            <EmptyState message="No forecast data" hint="Train models in the AI service first." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={riskDistribution} dataKey="value" nameKey="name"
                  cx="50%" cy="46%" outerRadius={95} paddingAngle={3}
                  label={({ name, percent }) => percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : null}
                  labelLine={false}>
                  {riskDistribution.map(r => <Cell key={r.name} fill={r.color} />)}
                </Pie>
                <Legend iconSize={10} formatter={v => <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{v}</span>} />
                <Tooltip formatter={(v, n) => [formatNumber(v), n]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="ML Model Accuracy" subtitle="MAPE per model — lower is better">
          {!hasMlData ? (
            <EmptyState message="No ML model data" hint="Models must be trained via the AI service." />
          ) : (
            <DataTable
              columns={[
                { key: 'model',     label: 'Model',     render: v => <span className="font-mono text-[11px]">{v}</span> },
                { key: 'avg_mape',  label: 'MAPE %',    render: v => v != null ? (
                  <span className="font-semibold" style={{ color: v < 15 ? '#10B981' : v < 30 ? '#F59E0B' : '#EF4444' }}>{v}%</span>
                ) : '—', noWrap: true },
                { key: 'avg_rmse',  label: 'RMSE',      render: v => v != null ? formatNumber(v, 2) : '—', muted: true, noWrap: true },
                { key: 'sku_count', label: 'SKUs',      render: v => formatNumber(v), muted: true, noWrap: true },
              ]}
              rows={modelAccuracy}
              emptyMsg="No model data"
            />
          )}
        </SectionCard>
      </div>

      {/* Forecast predictions table */}
      <SectionCard
        title="Forecast Predictions"
        subtitle={hasAiData ? `${predictions.length} products · sorted by risk` : 'No predictions available'}
      >
        {!hasAiData ? (
          <EmptyState message="No prediction records found" hint="Run the forecasting pipeline to generate predictions." />
        ) : (
          <DataTable
            searchable
            searchPlaceholder="Search products…"
            columns={[
              { key: 'product', label: 'Product', render: (v) => v?.name || '—' },
              { key: 'product', label: 'SKU', render: (v) => (
                <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>{v?.sku || '—'}</span>
              )},
              { key: 'product', label: 'Stock', render: (v) => (
                <span>{formatNumber(v?.currentStock ?? 0)} / {formatNumber(v?.reorderLevel ?? 0)}</span>
              ), noWrap: true },
              { key: 'inventoryRisk', label: 'Risk', render: v => (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase"
                  style={{ background: `${RISK_COLOR[v] || '#94A3B8'}20`, color: RISK_COLOR[v] || '#94A3B8' }}>
                  {v || '—'}
                </span>
              ), noWrap: true },
              { key: 'suggestedPurchase', label: 'Buy Qty', render: v => (
                <span className="font-semibold" style={{ color: '#10B981' }}>{v != null ? formatNumber(v) : '—'}</span>
              ), noWrap: true },
              { key: 'daysOfStock',      label: 'Days Left',  render: v => v != null ? `${Math.round(v)}d` : '—', muted: true, noWrap: true },
              { key: 'confidenceScore',  label: 'Confidence', render: v => v != null ? `${v.toFixed(1)}%` : '—', muted: true, noWrap: true },
            ]}
            rows={predictions}
            emptyMsg="No predictions"
          />
        )}
      </SectionCard>
    </div>
  )
}

// ── AI Insights ───────────────────────────────────────────────────────────────
function AIInsightsTab() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ai-insights-report'],
    queryFn:  () => axiosInstance.get('/ai/insights').then(r => r.data?.data),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const insights = data?.insights || []
  const isOffline = data?.offline === true

  const INSIGHT_CONFIG = {
    alert:          { color: '#EF4444', bg: 'rgba(239,68,68,.1)',    border: 'rgba(239,68,68,.25)',    Icon: AlertTriangle },
    recommendation: { color: '#10B981', bg: 'rgba(16,185,129,.1)',   border: 'rgba(16,185,129,.25)',   Icon: CheckCircle   },
    forecast:       { color: '#06B6D4', bg: 'rgba(6,182,212,.1)',    border: 'rgba(6,182,212,.25)',    Icon: Target        },
    trend:          { color: '#3B82F6', bg: 'rgba(59,130,246,.1)',   border: 'rgba(59,130,246,.25)',   Icon: TrendingUp    },
    warning:        { color: '#F59E0B', bg: 'rgba(245,158,11,.1)',   border: 'rgba(245,158,11,.25)',   Icon: AlertTriangle },
    info:           { color: '#8B5CF6', bg: 'rgba(139,92,246,.1)',   border: 'rgba(139,92,246,.25)',   Icon: Info          },
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="rounded-xl p-5 space-y-3 animate-pulse"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl" style={{ background: 'var(--surface-muted)' }} />
              <div className="flex-1 space-y-2">
                <div className="h-4 rounded" style={{ background: 'var(--surface-muted)', width: '40%' }} />
                <div className="h-3 rounded" style={{ background: 'var(--surface-muted)', width: '70%' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (isError) return <ErrorState onRetry={refetch} />

  if (!insights.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Brain className="w-12 h-12 opacity-25" style={{ color: 'var(--text-muted)' }} />
        <div className="text-center">
          <p className="font-semibold text-[15px]" style={{ color: 'var(--text-primary)' }}>
            {isOffline ? 'AI Service Unavailable' : 'No AI Insights Yet'}
          </p>
          <p className="text-[13px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
            {isOffline
              ? 'The AI service is offline. Start the Python AI service and try again.'
              : 'The AI service is generating insights from your inventory and sales data.'}
          </p>
        </div>
        <button onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <RotateCcw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header strip */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5" style={{ color: '#8B5CF6' }} />
          <span className="font-semibold text-[15px]" style={{ color: 'var(--text-primary)' }}>
            {insights.length} AI-Generated Insights
          </span>
        </div>
        <button onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {insights.map((insight, i) => {
        const type   = insight.type || insight.category || 'info'
        const cfg    = INSIGHT_CONFIG[type] || INSIGHT_CONFIG.info
        const IIcon  = cfg.Icon
        const priority = insight.priority || insight.severity
        return (
          <div key={i} className="rounded-xl p-5"
            style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${cfg.color}20` }}>
                <IIcon className="w-5 h-5" style={{ color: cfg.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="font-semibold text-[14px]" style={{ color: 'var(--text-primary)' }}>
                    {insight.title || insight.message?.slice(0, 60) || `Insight ${i + 1}`}
                  </p>
                  {priority && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full"
                      style={{
                        background: priority === 'high' ? 'rgba(239,68,68,.15)' : priority === 'medium' ? 'rgba(245,158,11,.15)' : 'rgba(16,185,129,.15)',
                        color:      priority === 'high' ? '#EF4444'             : priority === 'medium' ? '#F59E0B'             : '#10B981',
                      }}>
                      {priority}
                    </span>
                  )}
                  <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full ml-auto"
                    style={{ background: `${cfg.color}15`, color: cfg.color }}>
                    {type}
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {insight.message || insight.description || '—'}
                </p>
                {insight.action && (
                  <p className="mt-2 text-[12px] font-medium" style={{ color: cfg.color }}>
                    → {insight.action}
                  </p>
                )}
                {insight.product_name && (
                  <p className="mt-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Product: {insight.product_name}
                    {insight.sku_id && ` · SKU: ${insight.sku_id}`}
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Analytics (deep-dive, uses analyticsService → Express /analytics/*) ──────
const SCATTER_STATUS_COLOR = {
  healthy: '#10B981', low: '#F59E0B', critical: '#EF4444', out_of_stock: '#DC2626', overstock: '#6366F1',
}

function ScatterTip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload || {}
  return (
    <div className="rounded-xl p-3 shadow-xl text-[12px]"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
      <p className="font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>{d.name || `SKU ${d.sku_id}`}</p>
      {d.category && <p className="mb-1" style={{ color: 'var(--text-muted)' }}>{d.category}</p>}
      <p style={{ color: '#EF4444' }}>Stockout risk: {((d.x || 0)*100).toFixed(1)}%</p>
      <p style={{ color: '#6366F1' }}>Overstock risk: {((d.y || 0)*100).toFixed(1)}%</p>
      <p className="mt-1 font-semibold capitalize"
        style={{ color: SCATTER_STATUS_COLOR[d.status] || '#94A3B8' }}>
        {d.status?.replace('_', ' ')}
      </p>
    </div>
  )
}

function AnalyticsTab({ days }) {
  const { data: summary,    isLoading: sumL  } = useQuery({ queryKey: ['a-summary'],           queryFn: () => analyticsService.getDashboardSummary().then(r => r.data?.data),               staleTime: 60_000 })
  const { data: trend,      isLoading: trL   } = useQuery({ queryKey: ['a-trend', days],       queryFn: () => analyticsService.getRevenueTrend(days).then(r => r.data?.data),              staleTime: 60_000 })
  const { data: breakdown,  isLoading: bdL   } = useQuery({ queryKey: ['a-breakdown', days],   queryFn: () => analyticsService.getRevenueBreakdown(days).then(r => r.data?.data),          staleTime: 60_000 })
  const { data: monthly,    isLoading: moL   } = useQuery({ queryKey: ['a-monthly'],           queryFn: () => analyticsService.getMonthlyTrend(12).then(r => r.data?.data),                staleTime: 60_000 })
  const { data: velocity,   isLoading: velL  } = useQuery({ queryKey: ['a-velocity', days],   queryFn: () => analyticsService.getVelocityRanking(15, days).then(r => r.data?.data),       staleTime: 60_000 })
  const { data: catPerf,    isLoading: catL  } = useQuery({ queryKey: ['a-catperf', days],    queryFn: () => analyticsService.getCategoryPerformance(days).then(r => r.data?.data),        staleTime: 60_000 })
  const { data: turnover,   isLoading: toL   } = useQuery({ queryKey: ['a-turnover', days],   queryFn: () => analyticsService.getInventoryTurnover(days).then(r => r.data?.data),          staleTime: 60_000 })
  const { data: scatter,    isLoading: scL   } = useQuery({ queryKey: ['a-scatter'],          queryFn: () => analyticsService.getRiskScatter(300).then(r => r.data?.data),                 staleTime: 60_000 })
  const { data: heatmap,    isLoading: hmL   } = useQuery({ queryKey: ['a-heatmap'],          queryFn: () => analyticsService.getSalesHeatmap(90).then(r => r.data?.data),                 staleTime: 60_000 })
  const { data: periodComp, isLoading: pcL   } = useQuery({ queryKey: ['a-period', days],     queryFn: () => analyticsService.getPeriodComparison(days).then(r => r.data?.data),           staleTime: 60_000 })

  // Heatmap grid setup
  const hmLookup = {}
  ;(heatmap || []).forEach(r => { hmLookup[`${r.day_of_week}-${r.hour}`] = r.orders })
  const hmMax = Math.max(...Object.values(hmLookup), 1)
  const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

  const gr = summary?.revenue_growth_pct
  const fmtK = v => v == null ? '—' : v >= 1_000_000 ? `NPR ${(v/1_000_000).toFixed(1)}M` : v >= 1_000 ? `NPR ${(v/1_000).toFixed(0)}K` : `NPR ${formatNumber(v)}`

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard Icon={TrendingUp}   label="Revenue (Period)"  value={fmtK(summary?.revenue_30d)}          color="#3B82F6"
          growth={gr != null ? +gr.toFixed(1) : undefined} />
        <KpiCard Icon={ShoppingCart} label="Transactions"      value={formatNumber(summary?.total_transactions_30d)} color="#10B981" />
        <KpiCard Icon={DollarSign}   label="Avg Order Value"   value={fmtK(summary?.avg_order_value_30d)}  color="#F59E0B" />
        <KpiCard Icon={AlertTriangle} label="Unread Alerts"    value={formatNumber(summary?.unread_alerts)} color="#EF4444" />
      </div>

      {/* Revenue trend + Category pie */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3">
          <SectionCard title="Revenue Trend" subtitle={`Daily performance over last ${days} days`}>
            {trL ? <Sk h="h-[220px]" rounded="rounded-lg" /> : !(trend?.length) ? <EmptyState message="No sales in this period" hint="" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trend} margin={{ top: 5, right: 10, bottom: 0, left: 5 }}>
                  <defs>
                    <linearGradient id="ag1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}   />
                    </linearGradient>
                    <linearGradient id="ag2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10B981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={d => d?.slice(5)} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                  <Tooltip content={<ChartTooltip currency />} />
                  <Legend />
                  <Area dataKey="revenue" name="Revenue" stroke="#3B82F6" strokeWidth={2} fill="url(#ag1)" />
                  <Area dataKey="orders"  name="Orders"  stroke="#10B981" strokeWidth={1.5} fill="url(#ag2)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>
        <div className="lg:col-span-2">
          <SectionCard title="Revenue by Category">
            {bdL ? <Sk h="h-[220px]" rounded="rounded-lg" /> : !(breakdown?.length) ? <EmptyState message="No breakdown data" hint="" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={breakdown} dataKey="value" nameKey="name"
                    cx="50%" cy="46%" innerRadius={55} outerRadius={90} paddingAngle={2}
                    label={({ percent }) => percent > 0.05 ? `${(percent*100).toFixed(0)}%` : null} labelLine={false}>
                    {breakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [formatCurrency(v), 'Revenue']} />
                  <Legend iconSize={10} formatter={v => <span style={{ fontSize: 11, color: 'var(--text-primary)' }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Monthly trend */}
      <SectionCard title="Monthly Revenue" subtitle="Last 12 months — revenue vs quantity sold">
        {moL ? <Sk h="h-[220px]" rounded="rounded-lg" /> : !(monthly?.length) ? <EmptyState message="No monthly data" hint="" /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly} margin={{ top: 5, right: 20, bottom: 0, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis yAxisId="l" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
              <YAxis yAxisId="r" orientation="right" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <Tooltip content={<ChartTooltip currency />} />
              <Legend />
              <Bar yAxisId="l" dataKey="revenue"  name="Revenue"  fill="#3B82F6" radius={[3,3,0,0]} />
              <Bar yAxisId="r" dataKey="quantity" name="Quantity" fill="#10B981" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* Sales velocity + Period comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Sales Velocity" subtitle="Top products by units/day">
          {velL ? <Sk h="h-[240px]" rounded="rounded-lg" /> : !(velocity?.length) ? <EmptyState message="No velocity data" hint="" /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={velocity.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <YAxis type="category" dataKey="name"
                  tickFormatter={v => v?.length > 18 ? v.slice(0, 18) + '…' : (v || '')}
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }} width={110} />
                <Tooltip formatter={v => [`${v} units/day`, 'Velocity']} />
                <Bar dataKey="velocity_per_day" name="Units/day" radius={[0, 4, 4, 0]}>
                  {velocity.slice(0, 10).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Period-over-Period Revenue" subtitle={`This ${days}d vs previous ${days}d by category`}>
          {pcL ? <Sk h="h-[240px]" rounded="rounded-lg" /> : !(periodComp?.length) ? <EmptyState message="No comparison data" hint="" /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={periodComp.slice(0, 8)} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                  tickFormatter={v => v?.length > 10 ? v.slice(0, 10) + '…' : (v || '')} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip content={<ChartTooltip currency />} />
                <Legend />
                <Bar dataKey="current_revenue"  name={`Current ${days}d`}  fill="#3B82F6" radius={[3,3,0,0]} />
                <Bar dataKey="previous_revenue" name={`Previous ${days}d`} fill="#94A3B8" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      {/* Category performance table */}
      <SectionCard title="Category Performance" subtitle="Revenue, transactions, and market share breakdown">
        {catL ? <Sk h="h-[200px]" rounded="rounded-lg" /> : !(catPerf?.length) ? <EmptyState message="No category data" hint="" /> : (
          <DataTable
            columns={[
              { key: 'name',          label: 'Category' },
              { key: 'revenue',       label: 'Revenue',      render: v => formatCurrency(v),  noWrap: true },
              { key: 'transactions',  label: 'Transactions', render: v => formatNumber(v),    noWrap: true, muted: true },
              { key: 'avg_order_value', label: 'AOV',        render: v => formatCurrency(v),  noWrap: true, muted: true },
              { key: 'revenue_pct',   label: 'Share %',      render: (v, r) => (
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
                    <div className="h-full rounded-full" style={{ width: `${v || 0}%`, background: '#3B82F6' }} />
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{(v || 0).toFixed(1)}%</span>
                </div>
              ), noWrap: true },
            ]}
            rows={catPerf}
          />
        )}
      </SectionCard>

      {/* Inventory Turnover */}
      <SectionCard title="Inventory Turnover by Category" subtitle="Annualized rate — higher means faster moving stock">
        {toL ? <Sk h="h-[220px]" rounded="rounded-lg" /> : !(turnover?.length) ? <EmptyState message="No turnover data" hint="" /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={turnover.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} label={{ value: 'Turns/yr', position: 'insideRight', offset: -5, fontSize: 10, fill: '#94A3B8' }} />
              <YAxis type="category" dataKey="name"
                tickFormatter={v => v?.length > 18 ? v.slice(0, 18) + '…' : (v || '')}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }} width={110} />
              <Tooltip formatter={v => [`${v?.toFixed(2)}×/yr`, 'Turnover']} />
              <Bar dataKey="turnover_rate" name="Turnover Rate" radius={[0, 4, 4, 0]}>
                {turnover.slice(0, 10).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* Risk Scatter Matrix */}
      <SectionCard title="SKU Risk Matrix" subtitle="Stockout risk vs overstock risk — each point is one product">
        <div className="flex items-center gap-4 mb-3 flex-wrap">
          {Object.entries(SCATTER_STATUS_COLOR).map(([s, c]) => (
            <span key={s} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c }} />
              {s.replace('_', ' ')}
            </span>
          ))}
        </div>
        {scL ? <Sk h="h-[300px]" rounded="rounded-lg" /> : !(scatter?.length) ? <EmptyState message="No scatter data" hint="" /> : (
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 25, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
              <XAxis type="number" dataKey="x" domain={[0, 1]} name="Stockout Risk"
                tickFormatter={v => `${(v*100).toFixed(0)}%`}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false}
                label={{ value: 'Stockout Risk →', position: 'insideBottom', offset: -15, fontSize: 11, fill: '#94A3B8' }} />
              <YAxis type="number" dataKey="y" domain={[0, 1]} name="Overstock Risk"
                tickFormatter={v => `${(v*100).toFixed(0)}%`}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={46}
                label={{ value: 'Overstock Risk →', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#94A3B8' }} />
              <ZAxis range={[35, 70]} />
              <Tooltip content={<ScatterTip />} />
              <Scatter data={scatter} opacity={0.75}>
                {scatter.map((e, i) => <Cell key={i} fill={SCATTER_STATUS_COLOR[e.status] || '#94A3B8'} />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* Sales Heatmap */}
      <SectionCard title="Sales Activity Heatmap" subtitle="Order frequency by day of week × hour (last 90 days)">
        {hmL ? <Sk h="h-[160px]" rounded="rounded-lg" /> : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: 560 }}>
              <div className="flex gap-0.5 mb-1" style={{ paddingLeft: 44 }}>
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="text-center flex-1 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    {h % 4 === 0 ? `${h}h` : ''}
                  </div>
                ))}
              </div>
              {DOW.map((day, di) => (
                <div key={day} className="flex items-center gap-0.5 mb-0.5">
                  <span className="text-[10px] font-medium text-right pr-2 shrink-0" style={{ width: 40, color: 'var(--text-muted)' }}>{day}</span>
                  {Array.from({ length: 24 }, (_, h) => {
                    const cnt = hmLookup[`${di + 1}-${h}`] || 0
                    const alpha = cnt > 0 ? Math.max(0.08, cnt / hmMax) : 0.03
                    return (
                      <div key={h} className="flex-1 rounded-sm" title={`${day} ${h}:00 — ${cnt} orders`}
                        style={{ height: 20, background: cnt > 0 ? `rgba(37,99,235,${alpha})` : 'var(--surface-muted)', border: '1px solid var(--border)' }} />
                    )
                  })}
                </div>
              ))}
              <div className="flex items-center gap-2 mt-2.5 justify-end">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Low</span>
                {[0.06, 0.2, 0.4, 0.65, 0.85, 1].map(v => (
                  <div key={v} className="w-5 h-3 rounded-sm" style={{ background: `rgba(37,99,235,${v})` }} />
                ))}
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>High</span>
              </div>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function ReportsPage() {
  const [tab,       setTab]       = useState('executive')
  const [preset,    setPreset]    = useState('30')
  const [startDate, setStartDate] = useState('')
  const [endDate,   setEndDate]   = useState('')
  const [category,  setCategory]  = useState('')
  const [supplier,  setSupplier]  = useState('')
  const printRef = useRef(null)

  const params = useMemo(
    () => computeParams(preset, startDate, endDate, category, supplier),
    [preset, startDate, endDate, category, supplier]
  )

  const isAnalyticsTab   = tab === 'analytics'
  const isAiInsightsTab  = tab === 'ai-insights'
  const isSelfManagedTab = isAnalyticsTab || isAiInsightsTab
  const {
    data: reportData, isLoading, isFetching, isError, refetch,
  } = useQuery({
    queryKey:  ['report', tab, params],
    queryFn:   () => REPORT_SVC[tab](params).then(r => r.data?.data),
    staleTime: 2 * 60 * 1000,
    retry:     1,
    enabled:   !isSelfManagedTab,
  })

  const { data: categories } = useQuery({
    queryKey: ['categories-list'],
    queryFn:  () => axiosInstance.get('/categories').then(r => r.data?.data?.categories || r.data?.data || []),
    staleTime: 10 * 60 * 1000,
  })
  const { data: suppliers } = useQuery({
    queryKey: ['suppliers-list'],
    queryFn:  () => axiosInstance.get('/suppliers?limit=200').then(r => r.data?.data?.suppliers || r.data?.data || []),
    staleTime: 10 * 60 * 1000,
  })
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn:  () => axiosInstance.get('/settings').then(r => r.data?.settings || {}),
    staleTime: 60 * 60 * 1000,
  })

  const activeTab  = TABS.find(t => t.key === tab)
  const exportRows = useMemo(() => getExportRows(tab, reportData), [tab, reportData])

  function handleCSV() {
    if (!exportRows.length) return
    exportCSV(exportRows, `${tab}-report-${new Date().toISOString().slice(0,10)}.csv`)
  }
  function handleExcel() {
    downloadExcel(exportRows, `${tab}-report-${new Date().toISOString().slice(0,10)}`)
  }
  function handlePrint() {
    let el = document.getElementById('report-print-style')
    if (el) el.remove()
    el = document.createElement('style')
    el.id = 'report-print-style'
    el.textContent = PRINT_CSS
    document.head.appendChild(el)
    window.print()
  }

  const selCls   = 'text-[12px] rounded-lg px-2.5 py-1.5 outline-none cursor-pointer'
  const selStyle = { background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--surface-page)' }}>
      <style>{PRINT_CSS}</style>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-3 no-print">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-[22px] font-bold" style={{ color: 'var(--text-primary)' }}>Reports</h1>
            <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Business intelligence & analytics
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isSelfManagedTab && (
              <button onClick={() => refetch()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-80"
                style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            )}
            {!isSelfManagedTab && (
              <>
                <button onClick={handleCSV} disabled={!exportRows.length}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                  style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <FileText className="w-3.5 h-3.5" /> CSV
                </button>
                <button onClick={handleExcel} disabled={!exportRows.length}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                  style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                </button>
                <button onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-80"
                  style={{ background: activeTab?.color || '#6366F1', color: '#fff', border: 'none' }}>
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Tab navigation ───────────────────────────────────────────────── */}
        <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {TABS.map(t => {
            const active = t.key === tab
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap shrink-0 transition-all"
                style={{
                  background: active ? `${t.color}20` : 'transparent',
                  color:      active ? t.color : 'var(--text-muted)',
                  border:     active ? `1px solid ${t.color}40` : '1px solid transparent',
                }}>
                <t.Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* ── Filter toolbar ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <Filter className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />

          {/* Date presets */}
          <div className="flex gap-1 flex-wrap">
            {PRESETS.map(p => (
              <button key={p.value} onClick={() => setPreset(p.value)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap"
                style={{
                  background: preset === p.value ? activeTab?.color : 'var(--surface-card)',
                  color:      preset === p.value ? '#fff' : 'var(--text-muted)',
                  border:     `1px solid ${preset === p.value ? activeTab?.color : 'var(--border)'}`,
                }}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom range */}
          {preset === 'custom' && (
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className={selCls} style={selStyle} />
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>to</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className={selCls} style={selStyle} />
            </div>
          )}

          {/* Category & supplier — hidden on self-managed tabs */}
          {!isSelfManagedTab && (
            <>
              <select value={category} onChange={e => setCategory(e.target.value)} className={selCls} style={selStyle}>
                <option value="">All Categories</option>
                {(categories || []).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
              <select value={supplier} onChange={e => setSupplier(e.target.value)} className={selCls} style={selStyle}>
                <option value="">All Suppliers</option>
                {(suppliers || []).map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
              {(category || supplier) && (
                <button
                  onClick={() => { setCategory(''); setSupplier('') }}
                  className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg"
                  style={{ color: '#EF4444', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)' }}>
                  <XCircle className="w-3 h-3" /> Clear filters
                </button>
              )}
            </>
          )}
          {isAnalyticsTab && (
            <span className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg"
              style={{ background: 'rgba(59,130,246,.1)', color: '#3B82F6', border: '1px solid rgba(59,130,246,.25)' }}>
              <Zap className="w-3 h-3" /> Showing aggregated analytics data
            </span>
          )}
          {isAiInsightsTab && (
            <span className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg"
              style={{ background: 'rgba(139,92,246,.1)', color: '#8B5CF6', border: '1px solid rgba(139,92,246,.25)' }}>
              <Brain className="w-3 h-3" /> AI-generated insights from inventory & sales
            </span>
          )}
        </div>
      </div>

      {/* ── Print area ──────────────────────────────────────────────────────── */}
      <div id="report-print-area" className="px-6 py-4 flex-1" ref={printRef}>
        <PrintHeader company={settings} tabLabel={activeTab?.label} preset={preset} />

        <AnimatePresence mode="wait">
          {isAnalyticsTab ? (
            <motion.div key="analytics"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}>
              <AnalyticsTab days={presetToDays(preset)} />
            </motion.div>
          ) : isAiInsightsTab ? (
            <motion.div key="ai-insights"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}>
              <AIInsightsTab />
            </motion.div>
          ) : isLoading ? (
            <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ReportSkeleton />
            </motion.div>
          ) : isError ? (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ErrorState onRetry={refetch} />
            </motion.div>
          ) : (
            <motion.div key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}>
              {tab === 'executive'  && <ExecutiveReport  data={reportData} />}
              {tab === 'sales'      && <SalesReport      data={reportData} />}
              {tab === 'purchases'  && <PurchasesReport  data={reportData} />}
              {tab === 'inventory'  && <InventoryReport  data={reportData} />}
              {tab === 'profit'     && <ProfitReport     data={reportData} />}
              {tab === 'suppliers'  && <SuppliersReport  data={reportData} />}
              {tab === 'forecast'   && <ForecastReport   data={reportData} />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
