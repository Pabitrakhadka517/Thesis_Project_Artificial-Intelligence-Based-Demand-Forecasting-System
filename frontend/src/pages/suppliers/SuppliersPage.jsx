import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell,
  Legend,
} from 'recharts'
import {
  Truck, Plus, Search, Edit2, Trash2, X, Star, Phone,
  MapPin, Clock, CheckCircle, XCircle, TrendingUp, Package,
  DollarSign, AlertTriangle, BarChart2, Activity, ChevronRight,
  Award, Calendar, ShoppingCart, Layers, ArrowUpRight,
  CreditCard, Timer, Building2, Globe,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { suppliersService } from '@/services/suppliersService'
import { useToast } from '@/hooks/useToast'
import { useRole } from '@/hooks/useRole'
import { formatDate, formatRelativeTime, formatRs } from '@/utils'
import { ImageUpload } from '@/components/common/ImageUpload'
import { ErrorState } from '@/components/common/ErrorState'
import { EmptyState } from '@/components/common/EmptyState'
import { Modal, ConfirmDialog } from '@/components/common/Modal'
import { PageHeader } from '@/components/common/PageHeader'
import { Input } from '@/components/common/Input'
import { Select } from '@/components/common/Select'
import { Textarea } from '@/components/common/Textarea'
import { Button } from '@/components/common/Button'
import { Pagination } from '@/components/common/Pagination'
import { ChartTooltip, PieChartTooltip } from '@/components/charts/ChartTooltip'
import { ChartEmptyState } from '@/components/charts/ChartEmptyState'
import { CHART_PALETTE } from '@/constants/statusColors'
import { useDebounce } from '@/hooks/useDebounce'

// ── constants ─────────────────────────────────────────────────────────────────
const PAYMENT_TERMS = [
  { value: 'cash',      label: 'Cash on Delivery' },
  { value: 'credit_15', label: 'Credit 15 Days'   },
  { value: 'credit_30', label: 'Credit 30 Days'   },
  { value: 'credit_60', label: 'Credit 60 Days'   },
]
const PAYMENT_LABEL = { cash: 'Cash', credit_15: '15d', credit_30: '30d', credit_60: '60d' }
// Canonical chart palette (constants/statusColors.js) — previously two local
// arrays here with drifting hex values against the rest of the app's charts.
const PIE_COLORS    = CHART_PALETTE
const BAR_COLORS    = CHART_PALETTE
const MONTHS        = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── helpers ───────────────────────────────────────────────────────────────────
const fmtRs = formatRs
function fmtN(v) { return v == null ? '—' : Number(v).toLocaleString() }
function monthLabel({ year, month }) { return `${MONTHS[month]} '${String(year).slice(2)}` }

// ── form schema ───────────────────────────────────────────────────────────────
const schema = z.object({
  name:          z.string().min(2, 'Name required'),
  contactPerson: z.string().optional(),
  phone:         z.string().optional(),
  email:         z.string().email('Invalid email').optional().or(z.literal('')),
  address:       z.string().optional(),
  district:      z.string().optional(),
  leadTimeDays:  z.coerce.number().min(0).default(7),
  paymentTerms:  z.enum(['cash','credit_15','credit_30','credit_60']).default('cash'),
  rating:        z.coerce.number().min(1).max(5).default(3),
  notes:         z.string().optional(),
})

// ── reusable small components ─────────────────────────────────────────────────
function StarRating({ value = 3, size = 'sm' }) {
  const sz = size === 'lg' ? 'h-4 w-4' : 'h-3 w-3'
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(s => (
        <Star key={s} className={sz}
          style={{ color: s <= value ? '#F59E0B' : 'var(--border)', fill: s <= value ? '#F59E0B' : 'none' }} />
      ))}
    </div>
  )
}

function KpiCard({ title, value, sub, icon: Icon, color, loading }) {
  return (
    <div className="rounded-xl p-4 relative overflow-hidden"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: color }} />
      <div className="flex items-start justify-between mb-3">
        <div className="h-9 w-9 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{title}</p>
      {loading
        ? <div className="h-6 w-20 rounded animate-pulse" style={{ background: 'var(--surface-muted)' }} />
        : <p className="text-[22px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{value}</p>
      }
      {sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

function PanelCard({ title, children, className = '' }) {
  return (
    <div className={`rounded-xl p-5 ${className}`}
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
      {title && (
        <p className="text-[12px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
          {title}
        </p>
      )}
      {children}
    </div>
  )
}

function StatusBadge({ status }) {
  const active = status === 'active'
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
      style={{
        background: active ? 'rgba(16,185,129,.12)' : 'rgba(100,116,139,.12)',
        color:      active ? '#10B981' : '#64748B',
      }}>
      {active ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

function OnTimeChip({ rate }) {
  if (rate == null) return null
  const color = rate >= 90 ? '#10B981' : rate >= 70 ? '#F59E0B' : '#EF4444'
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: `${color}18`, color }}>
      {rate}% on-time
    </span>
  )
}

// ─── CRUD MODAL ───────────────────────────────────────────────────────────────
function SupplierForm({ defaultValues, onSubmit, isPending, submitLabel, onLogoSelect, onLogoRemove, currentLogo, logoUploading }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaultValues || { leadTimeDays: 7, paymentTerms: 'cash', rating: 3 },
  })
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Logo upload row */}
      <div className="flex items-center gap-4 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <ImageUpload
          value={currentLogo || null}
          onFileSelect={onLogoSelect}
          onRemove={onLogoRemove}
          uploading={logoUploading}
          label="Supplier Logo"
          shape="square"
          size="sm"
        />
        <div>
          <p className="text-[12px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Supplier Logo</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Optional. JPEG, PNG, or WebP — max 5 MB.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input label="Company Name *" placeholder="Himalayan Traders" error={errors.name?.message} {...register('name')} />
        <Input label="Contact Person" placeholder="Rajesh Shrestha" {...register('contactPerson')} />
        <Input label="Phone" placeholder="+977-01-..." error={errors.phone?.message} {...register('phone')} />
        <Input label="Email" type="email" placeholder="supplier@email.com" error={errors.email?.message} {...register('email')} />
        <Input label="Address" placeholder="Kalimati, Kathmandu" {...register('address')} />
        <Input label="District" placeholder="Kathmandu" {...register('district')} />
        <Input label="Lead Time (days)" type="number" min={0} error={errors.leadTimeDays?.message} {...register('leadTimeDays')} />
        <Input label="Rating (1-5)" type="number" min={1} max={5} error={errors.rating?.message} {...register('rating')} />
      </div>
      <Select label="Payment Terms" options={PAYMENT_TERMS} {...register('paymentTerms')} />
      <Textarea label="Notes" rows={2} placeholder="Additional notes…" {...register('notes')} />
      <Button type="submit" className="w-full" disabled={isPending} loading={isPending}>
        {isPending ? 'Saving…' : submitLabel}
      </Button>
    </form>
  )
}

// ─── SUPPLIER DETAIL PANEL ────────────────────────────────────────────────────
function DetailPanel({ supplierId, onClose, onEdit }) {
  const { data: raw, isLoading } = useQuery({
    queryKey: ['supplier-performance', supplierId],
    queryFn:  () => suppliersService.getPerformance(supplierId).then(r => r.data.data),
    staleTime: 60_000,
    enabled: !!supplierId,
  })

  const s   = raw?.supplier    || {}
  const p   = raw?.performance || {}
  const top = raw?.topProducts || []
  const trend = (raw?.monthlyTrend || []).map(t => ({ ...t, label: monthLabel(t) }))
  const payments = raw?.paymentBreakdown || []
  const recent = raw?.recentPurchases || []

  const perfKpis = [
    { label: 'Total Orders',      value: fmtN(p.totalOrders),    color: '#2563EB', icon: ShoppingCart },
    { label: 'Total Spend',       value: fmtRs(p.totalAmount),   color: '#8B5CF6', icon: DollarSign  },
    { label: 'Avg Delivery',      value: p.avgDeliveryDays != null ? `${p.avgDeliveryDays}d` : '—', color: '#06B6D4', icon: Timer },
    { label: 'On-Time Rate',      value: p.onTimeRate != null ? `${p.onTimeRate}%` : '—', color: '#10B981', icon: CheckCircle },
    { label: 'Outstanding',       value: fmtRs(p.outstandingBalance), color: '#F59E0B', icon: CreditCard  },
    { label: 'Active Products',   value: fmtN(p.activeProducts),  color: '#F97316', icon: Package     },
  ]

  // Escape closes the drawer, matching the shared Modal's keyboard behavior.
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <motion.div
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      role="dialog" aria-modal="true" aria-label={s.name ? `${s.name} details` : 'Supplier details'}
      className="fixed right-0 top-0 bottom-0 z-40 w-130 max-w-[95vw] overflow-y-auto"
      style={{ background: 'var(--surface-card)', borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow-drawer)' }}
    >
      {/* overlay to close */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[-1]" style={{ background: 'rgba(0,0,0,.35)' }}
        onClick={onClose} />

      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
              style={{ background: 'rgba(37,99,235,.12)' }}>
              {s.logo
                ? <img src={s.logo} alt="" loading="lazy" decoding="async" className="h-11 w-11 object-cover" />
                : <Truck className="h-5 w-5" style={{ color: '#3B82F6' }} />
              }
            </div>
            <div>
              <h2 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>
                {isLoading ? '…' : s.name}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                {s.status && <StatusBadge status={s.status} />}
                {s.rating && <StarRating value={s.rating} />}
              </div>
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {onEdit && (
              <button onClick={() => onEdit(s)} aria-label={`Edit ${s.name || 'supplier'}`}
                className="h-8 w-8 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
                <Edit2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={onClose} aria-label="Close supplier details"
              className="h-8 w-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Contact row */}
        {!isLoading && (
          <div className="flex flex-wrap gap-3 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            {s.phone   && <span className="flex items-center gap-1.5"><Phone   className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />{s.phone}</span>}
            {s.address && <span className="flex items-center gap-1.5"><MapPin  className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />{s.address}</span>}
            {s.leadTimeDays != null && <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />{s.leadTimeDays}d lead</span>}
            {s.paymentTerms && <span className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />{PAYMENT_LABEL[s.paymentTerms]}</span>}
          </div>
        )}

        {/* KPI chips */}
        {isLoading ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_,i) => (
              <div key={i} className="rounded-lg h-16 animate-pulse" style={{ background: 'var(--surface-muted)' }} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {perfKpis.map(k => (
              <div key={k.label} className="rounded-lg p-3 text-center"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                <k.icon className="h-4 w-4 mx-auto mb-1" style={{ color: k.color }} />
                <p className="text-[14px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{k.value}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{k.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Delivery detail strip */}
        {!isLoading && p.avgDeliveryDays != null && (
          <div className="rounded-lg p-3 flex items-center gap-4"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <div className="flex-1 text-center">
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Avg Delivery</p>
              <p className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>{p.avgDeliveryDays}d</p>
            </div>
            <div className="w-px h-8" style={{ background: 'var(--border)' }} />
            <div className="flex-1 text-center">
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Min / Max</p>
              <p className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>{p.minDeliveryDays ?? '—'}d / {p.maxDeliveryDays ?? '—'}d</p>
            </div>
            <div className="w-px h-8" style={{ background: 'var(--border)' }} />
            <div className="flex-1 text-center">
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Late Orders</p>
              <p className="text-[15px] font-bold" style={{ color: p.lateDeliveries > 0 ? '#EF4444' : '#10B981' }}>{p.lateDeliveries}</p>
            </div>
            <div className="w-px h-8" style={{ background: 'var(--border)' }} />
            <div className="flex-1 text-center">
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Last Delivery</p>
              <p className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>{formatDate(p.lastDelivery, 'MMM d')}</p>
            </div>
          </div>
        )}

        {/* Monthly spend trend */}
        <PanelCard title="Purchase Trend — Last 6 Months">
          {isLoading ? (
            <div className="h-40 flex items-center justify-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
              Loading…
            </div>
          ) : trend.length === 0 ? (
            <ChartEmptyState height={140} message="No purchase data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="spGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={CHART_PALETTE[0]} stopOpacity={.25} />
                    <stop offset="95%" stopColor={CHART_PALETTE[0]} stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                <Tooltip content={<ChartTooltip formatY={fmtRs} />} />
                <Area type="monotone" dataKey="amount" name="Spend" stroke={CHART_PALETTE[0]} strokeWidth={2}
                  fill="url(#spGrad)" dot={{ r: 3, fill: CHART_PALETTE[0] }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </PanelCard>

        {/* Top Products */}
        {top.length > 0 && (
          <PanelCard title="Top Products Supplied">
            <div className="space-y-2">
              {top.map((prod, i) => {
                const pct = Math.round((prod.totalAmount / (p.totalAmount || 1)) * 100)
                return (
                  <div key={prod.productId || i} className="flex items-center gap-3">
                    <span className="text-[11px] font-bold w-5 shrink-0 text-center"
                      style={{ color: 'var(--text-muted)' }}>#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {prod.productName}
                      </p>
                      <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>{fmtRs(prod.totalAmount)}</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{fmtN(prod.totalQty)} units</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </PanelCard>
        )}

        {/* Payment breakdown */}
        {payments.length > 0 && (
          <PanelCard title="Payment Status">
            <div className="grid grid-cols-3 gap-2">
              {['paid','partial','pending'].map((st, i) => {
                const row = payments.find(p => p.status === st)
                const colors = { paid: '#10B981', partial: '#F59E0B', pending: '#EF4444' }
                return (
                  <div key={st} className="rounded-lg p-3 text-center"
                    style={{ background: 'var(--surface-muted)' }}>
                    <p className="text-[14px] font-bold" style={{ color: colors[st] }}>{row?.count || 0}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{fmtRs(row?.amount || 0)}</p>
                    <p className="text-[10px] font-semibold mt-0.5 capitalize" style={{ color: colors[st] }}>{st}</p>
                  </div>
                )
              })}
            </div>
          </PanelCard>
        )}

        {/* Recent Purchases */}
        {recent.length > 0 && (
          <PanelCard title="Recent Purchase Orders">
            <div className="space-y-2">
              {recent.map(po => {
                const statusColor = { received: '#10B981', ordered: '#2563EB', partial: '#F59E0B', cancelled: '#EF4444' }
                return (
                  <div key={po._id} className="flex items-center justify-between py-2"
                    style={{ borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <p className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {po.purchaseNumber}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {formatDate(po.purchaseDate)} · {po.items?.length || 0} item{(po.items?.length || 0) === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>{fmtRs(po.grandTotal)}</p>
                      <span className="text-[10px] font-semibold capitalize"
                        style={{ color: statusColor[po.status] || 'var(--text-muted)' }}>
                        {po.status}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </PanelCard>
        )}
      </div>
    </motion.div>
  )
}

// ─── DASHBOARD VIEW ───────────────────────────────────────────────────────────
function DashboardView() {
  const { data: raw, isLoading } = useQuery({
    queryKey: ['supplier-dashboard'],
    queryFn:  () => suppliersService.getDashboard().then(r => r.data.data),
    staleTime: 60_000,
  })

  const d         = raw || {}
  const trend     = (d.monthlyTrend || []).map(t => ({ ...t, label: monthLabel(t) }))
  const topList   = d.topSuppliers    || []
  const ratings   = d.ratingDistribution || []
  const payments  = d.paymentOverview || []

  const kpis = [
    { title: 'Total Suppliers',  value: fmtN(d.totalSuppliers),      sub: `${fmtN(d.activeSuppliers)} active`, icon: Building2,  color: '#2563EB' },
    { title: 'Total Spend',      value: fmtRs(d.totalPurchaseAmount), sub: `${fmtN(d.totalPurchaseOrders)} orders`,icon: DollarSign, color: '#8B5CF6' },
    { title: 'Outstanding',      value: fmtRs(d.outstandingAmount),   sub: 'pending + partial',                  icon: CreditCard,  color: '#F59E0B' },
    { title: 'Avg Delivery',     value: d.avgDeliveryDays != null ? `${d.avgDeliveryDays}d` : '—', sub: 'across received orders', icon: Timer, color: '#10B981' },
  ]

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => <KpiCard key={k.title} {...k} loading={isLoading} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly spend chart */}
        <PanelCard title="Monthly Purchase Spend" className="lg:col-span-2">
          {isLoading ? (
            <div className="h-52 flex items-center justify-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
              Loading…
            </div>
          ) : trend.length === 0 ? (
            <ChartEmptyState height={200} message="No purchase data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trend} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={CHART_PALETTE[3]} stopOpacity={.25} />
                    <stop offset="95%" stopColor={CHART_PALETTE[3]} stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <Tooltip content={<ChartTooltip formatY={fmtRs} />} />
                <Area type="monotone" dataKey="amount" name="Spend" stroke={CHART_PALETTE[3]} strokeWidth={2}
                  fill="url(#dashGrad)" dot={{ r: 3, fill: CHART_PALETTE[3] }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </PanelCard>

        {/* Rating distribution */}
        <PanelCard title="Supplier Ratings">
          {isLoading ? (
            <div className="h-52 animate-pulse rounded" style={{ background: 'var(--surface-muted)' }} />
          ) : (
            <div className="space-y-2 mt-1">
              {[5,4,3,2,1].map(r => {
                const row = ratings.find(x => x.rating === r)
                const cnt = row?.count || 0
                const max = Math.max(...ratings.map(x => x.count), 1)
                return (
                  <div key={r} className="flex items-center gap-2">
                    <StarRating value={r} />
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${(cnt / max) * 100}%`, background: '#F59E0B' }} />
                    </div>
                    <span className="text-[11px] w-4 text-right font-semibold" style={{ color: 'var(--text-muted)' }}>{cnt}</span>
                  </div>
                )
              })}
            </div>
          )}
        </PanelCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top suppliers */}
        <PanelCard title="Top Suppliers by Spend">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({length:5}).map((_,i)=><div key={i} className="h-10 rounded animate-pulse" style={{background:'var(--surface-muted)'}}/>)}
            </div>
          ) : topList.length === 0 ? (
            <p className="text-[13px] text-center py-8" style={{ color: 'var(--text-muted)' }}>No purchase data</p>
          ) : (
            <div className="space-y-3">
              {topList.map((sup, i) => {
                const pct = Math.round((sup.totalAmount / (d.totalPurchaseAmount || 1)) * 100)
                return (
                  <div key={sup.supplierId} className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 font-bold text-[12px] text-white"
                      style={{ background: BAR_COLORS[i % BAR_COLORS.length] }}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{sup.name}</p>
                        <p className="text-[12px] font-bold shrink-0 ml-2" style={{ color: 'var(--text-primary)' }}>{fmtRs(sup.totalAmount)}</p>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} />
                      </div>
                    </div>
                    <p className="text-[11px] shrink-0" style={{ color: 'var(--text-muted)' }}>{pct}%</p>
                  </div>
                )
              })}
            </div>
          )}
        </PanelCard>

        {/* Payment overview */}
        <PanelCard title="Payment Status Overview">
          {isLoading ? (
            <div className="h-48 animate-pulse rounded" style={{ background: 'var(--surface-muted)' }} />
          ) : payments.length === 0 ? (
            <ChartEmptyState height={180} message="No payment data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={payments} dataKey="amount" nameKey="status"
                  cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={3}>
                  {payments.map((_, i) => (
                    <Cell key={i} fill={['var(--color-success)','var(--brand-amber)','var(--color-danger)'][i % 3]} />
                  ))}
                </Pie>
                <Tooltip content={<PieChartTooltip formatValue={fmtRs} />} />
                <Legend iconSize={10} iconType="circle"
                  formatter={(v) => <span style={{ color: 'var(--text-secondary)', fontSize: 12, textTransform: 'capitalize' }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </PanelCard>
      </div>
    </div>
  )
}

// ─── ANALYTICS VIEW ───────────────────────────────────────────────────────────
function AnalyticsView() {
  const { data: raw, isLoading } = useQuery({
    queryKey: ['supplier-analytics'],
    queryFn:  () => suppliersService.getAnalytics().then(r => r.data.data),
    staleTime: 60_000,
  })

  const comparison  = raw?.supplierComparison   || []
  const delivery    = raw?.deliveryPerformance  || []
  const monthSpend  = raw?.monthlySpendBySupplier || []

  // Build stacked bar data for top 4 suppliers monthly spend
  const topSupNames = [...new Set(comparison.slice(0, 4).map(s => s.name))]
  const monthKeys   = [...new Set(monthSpend.map(r => monthLabel(r)))].sort()
  const stackedData = monthKeys.map(label => {
    const row = { label }
    topSupNames.forEach(name => {
      const match = monthSpend.find(r => r.supplierName === name && monthLabel(r) === label)
      row[name] = match?.amount || 0
    })
    return row
  })

  const [sortKey, setSortKey] = useState('totalAmount')
  const sorted = useMemo(() =>
    [...comparison].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0)),
    [comparison, sortKey]
  )

  const SortBtn = ({ k, label }) => (
    <button onClick={() => setSortKey(k)}
      className="text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors"
      style={{
        background: sortKey === k ? 'rgba(37,99,235,.12)' : 'transparent',
        color:      sortKey === k ? '#2563EB' : 'var(--text-muted)',
      }}>
      {label}
    </button>
  )

  return (
    <div className="space-y-6">
      {/* Supplier Comparison Table */}
      <PanelCard title="Supplier Performance Comparison">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Sort by:</span>
          <SortBtn k="totalAmount"  label="Total Spend" />
          <SortBtn k="totalOrders"  label="Orders" />
          <SortBtn k="avgOrderValue" label="Avg Order" />
          <SortBtn k="pendingAmount" label="Pending" />
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({length:6}).map((_,i)=><div key={i} className="h-10 rounded animate-pulse" style={{background:'var(--surface-muted)'}}/>)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Supplier','District','Rating','Orders','Spend','Avg Order','Pending','Last Order','Terms'].map(h => (
                    <th key={h} className="text-left py-2 pr-4 text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((sup, i) => (
                  <tr key={sup.supplierId}
                    style={{ borderBottom: '1px solid var(--border)', opacity: sup.status === 'inactive' ? .5 : 1 }}>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                          style={{ background: BAR_COLORS[i % BAR_COLORS.length] }}>{i+1}</div>
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{sup.name}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4" style={{ color: 'var(--text-muted)' }}>{sup.district || '—'}</td>
                    <td className="py-3 pr-4"><StarRating value={sup.rating || 3} /></td>
                    <td className="py-3 pr-4 font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtN(sup.totalOrders)}</td>
                    <td className="py-3 pr-4 font-bold" style={{ color: '#2563EB' }}>{fmtRs(sup.totalAmount)}</td>
                    <td className="py-3 pr-4" style={{ color: 'var(--text-secondary)' }}>{fmtRs(sup.avgOrderValue)}</td>
                    <td className="py-3 pr-4" style={{ color: sup.pendingAmount > 0 ? '#F59E0B' : 'var(--text-muted)' }}>{fmtRs(sup.pendingAmount)}</td>
                    <td className="py-3 pr-4" style={{ color: 'var(--text-muted)' }}>{formatDate(sup.lastOrder, 'MMM d')}</td>
                    <td className="py-3 pr-4">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)' }}>
                        {PAYMENT_LABEL[sup.paymentTerms] || sup.paymentTerms}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Delivery Performance */}
        <PanelCard title="Delivery Performance (Avg Days)">
          {isLoading ? (
            <div className="h-52 flex items-center justify-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
              Loading…
            </div>
          ) : delivery.length === 0 ? (
            <ChartEmptyState height={160} message="No delivery data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, delivery.length * 38)}>
              <BarChart data={delivery} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v}d`} />
                <YAxis type="category" dataKey="name" width={120}
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip formatY={v => `${v}d`} />} />
                <Bar dataKey="leadTimeDays" name="Lead Time" fill="var(--surface-muted)" radius={[0,3,3,0]} barSize={8} />
                <Bar dataKey="avgDays" name="Avg Actual" radius={[0,3,3,0]} barSize={8}>
                  {delivery.map((d, i) => (
                    <Cell key={i} fill={d.onTime ? 'var(--color-success)' : 'var(--color-danger)'} />
                  ))}
                </Bar>
                <Legend iconSize={10} iconType="circle"
                  formatter={v => <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{v}</span>} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </PanelCard>

        {/* Monthly spend stacked */}
        <PanelCard title="Monthly Spend by Top Suppliers">
          {isLoading ? (
            <div className="h-52 flex items-center justify-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
              Loading…
            </div>
          ) : stackedData.length === 0 ? (
            <ChartEmptyState height={200} message="No spend data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stackedData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <Tooltip content={<ChartTooltip formatY={fmtRs} />} />
                {topSupNames.map((name, i) => (
                  <Bar key={name} dataKey={name} stackId="a" fill={BAR_COLORS[i % BAR_COLORS.length]}
                    radius={i === topSupNames.length - 1 ? [3,3,0,0] : [0,0,0,0]} />
                ))}
                <Legend iconSize={8} iconType="circle"
                  formatter={v => <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{v}</span>} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </PanelCard>
      </div>
    </div>
  )
}

// ─── LIST VIEW ────────────────────────────────────────────────────────────────
function ListView({ onSelectSupplier, can }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [search, setSearch]   = useState('')
  const [status, setStatus]   = useState('')
  const [page, setPage]       = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [creating, setCreate] = useState(false)
  const [editing, setEdit]    = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const pendingLogoRef        = useRef(null)
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['suppliers', page, pageSize, debouncedSearch, status],
    queryFn:  () => suppliersService.getAll({ page, limit: pageSize, search: debouncedSearch, status }).then(r => r.data),
    staleTime: 30_000,
  })

  const suppliers  = data?.data        || []
  const total      = data?.pagination?.total      || 0

  const logoDeleteMutation = useMutation({
    mutationFn: (id) => suppliersService.deleteLogo(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast({ title: 'Logo removed', variant: 'success' }) },
    onError:   (e) => toast({ title: e.response?.data?.message || 'Remove failed', variant: 'error' }),
  })

  const createMutation = useMutation({
    mutationFn: (d) => suppliersService.create(d),
    onSuccess: async (res) => {
      const newId = res.data?.data?._id
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      if (pendingLogoRef.current && newId) {
        try {
          await suppliersService.uploadLogo(newId, pendingLogoRef.current)
          qc.invalidateQueries({ queryKey: ['suppliers'] })
        } catch { /* non-fatal — supplier already created */ }
        pendingLogoRef.current = null
      }
      toast({ title: 'Supplier added', variant: 'success' })
      setCreate(false)
    },
    onError:   (e) => toast({ title: e.response?.data?.message || 'Failed', variant: 'error' }),
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => suppliersService.update(id, data),
    onSuccess: async (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      qc.invalidateQueries({ queryKey: ['supplier-performance'] })
      if (pendingLogoRef.current) {
        try {
          await suppliersService.uploadLogo(id, pendingLogoRef.current)
          qc.invalidateQueries({ queryKey: ['suppliers'] })
        } catch { /* non-fatal */ }
        pendingLogoRef.current = null
      }
      toast({ title: 'Updated', variant: 'success' })
      setEdit(null)
    },
    onError:   (e) => toast({ title: e.response?.data?.message || 'Failed', variant: 'error' }),
  })
  const deleteMutation = useMutation({
    mutationFn: (id) => suppliersService.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast({ title: 'Deleted', variant: 'success' }); setDeleteTarget(null) },
    onError:   (e) => toast({ title: e.response?.data?.message || 'Failed', variant: 'error' }),
  })

  return (
    <>
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 h-9 rounded-lg flex-1 min-w-48"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input type="text" placeholder="Search suppliers…" aria-label="Search suppliers" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: 'var(--text-primary)' }} />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
          aria-label="Filter by status"
          className="h-9 px-3 rounded-lg text-[13px] outline-none"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Count */}
      <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
        {total} supplier{total !== 1 ? 's' : ''} found
      </p>

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl h-52 animate-pulse" style={{ background: 'var(--surface-card)' }} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : suppliers.length === 0 ? (
        <div className="rounded-xl" style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <EmptyState
            icon={Truck}
            title={search || status ? 'No matching suppliers' : 'No suppliers yet'}
            description={search || status ? 'Try a different search or clear the status filter.' : 'Add your first supplier to start placing purchase orders.'}
            action={
              (search || status) ? (
                <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setStatus(''); setPage(1) }}>Clear filters</Button>
              ) : can('inventory_manager') ? (
                <Button size="sm" icon={Plus} onClick={() => setCreate(true)}>Add Supplier</Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map(s => (
            <div key={s._id}
              role="button" tabIndex={0} aria-label={`View details for ${s.name}`}
              className="rounded-xl p-5 relative cursor-pointer group"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', transition: 'border-color .15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(3,4,94,.45)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              onClick={() => onSelectSupplier(s._id)}
              onKeyDown={e => {
                if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                  e.preventDefault()
                  onSelectSupplier(s._id)
                }
              }}
            >
              {/* Status */}
              <div className="absolute top-4 right-4 flex items-center gap-1.5">
                <StatusBadge status={s.status} />
              </div>

              {/* Name / contact */}
              <div className="flex items-start gap-3 mb-3 pr-20">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
                  style={{ background: 'rgba(37,99,235,.12)' }}>
                  {s.logo
                    ? <img src={s.logo} alt={s.name} loading="lazy" decoding="async" className="h-10 w-10 object-cover" />
                    : <Truck className="h-5 w-5" style={{ color: '#3B82F6' }} />
                  }
                </div>
                <div className="min-w-0">
                  <p className="text-[14px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                  {s.contactPerson && (
                    <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{s.contactPerson}</p>
                  )}
                </div>
              </div>

              {/* Details */}
              <div className="space-y-1.5 mb-4">
                {s.phone && (
                  <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                    <Phone className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />{s.phone}
                  </div>
                )}
                {s.address && (
                  <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                    <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />{s.address}
                  </div>
                )}
                <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                  <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                  {s.leadTimeDays}d lead · {PAYMENT_LABEL[s.paymentTerms] || s.paymentTerms}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between">
                <StarRating value={s.rating} />
                <div className="flex items-center gap-1">
                  <span className="text-[11px] opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: '#2563EB' }}>View details</span>
                  <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#2563EB' }} />
                  {can('inventory_manager') && (
                    <>
                      <button onClick={e => { e.stopPropagation(); setEdit(s) }}
                        aria-label={`Edit ${s.name}`}
                        className="h-7 w-7 rounded-md flex items-center justify-center ml-1"
                        style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={e => { e.stopPropagation(); e.currentTarget.style.background = 'var(--surface-muted)' }}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteTarget(s) }}
                        aria-label={`Delete ${s.name}`}
                        className="h-7 w-7 rounded-md flex items-center justify-center"
                        style={{ color: '#EF4444' }}
                        onMouseEnter={e => { e.stopPropagation(); e.currentTarget.style.background = 'rgba(239,68,68,.1)' }}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)}
        title="Delete supplier?"
        description={`This permanently deletes "${deleteTarget?.name}". This action cannot be undone.`}
        loading={deleteMutation.isPending}
      />

      {/* CRUD Modals */}
      <Modal open={creating} title="Add Supplier" onClose={() => { setCreate(false); pendingLogoRef.current = null }}>
        {creating && (
          <SupplierForm
            onSubmit={createMutation.mutate}
            isPending={createMutation.isPending}
            submitLabel="Add Supplier"
            onLogoSelect={(f) => { pendingLogoRef.current = f }}
            onLogoRemove={() => { pendingLogoRef.current = null }}
          />
        )}
      </Modal>
      <Modal open={!!editing} title="Edit Supplier" onClose={() => { setEdit(null); pendingLogoRef.current = null }}>
        {editing && (
          <SupplierForm
            defaultValues={editing}
            onSubmit={(d) => updateMutation.mutate({ id: editing._id, data: d })}
            isPending={updateMutation.isPending}
            submitLabel="Save Changes"
            currentLogo={editing.logo || null}
            onLogoSelect={(f) => { pendingLogoRef.current = f }}
            onLogoRemove={() => {
              if (editing.logo) logoDeleteMutation.mutate(editing._id)
              else pendingLogoRef.current = null
            }}
            logoUploading={logoDeleteMutation.isPending}
          />
        )}
      </Modal>

      {/* Add button (inside list so it has access to setCreate) */}
      {can('inventory_manager') && (
        <div className="fixed bottom-8 right-8 z-30">
          <button onClick={() => setCreate(true)}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl text-[13px] font-bold text-white shadow-xl"
            style={{ background: 'var(--brand-primary)' }}>
            <Plus className="h-4 w-4" /> Add Supplier
          </button>
        </div>
      )}
    </>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function SuppliersPage() {
  const { can } = useRole()
  const [tab, setTab]           = useState('list')
  const [selectedId, setSelect] = useState(null)
  const [editingFromPanel, setEditFromPanel] = useState(null)
  const qc = useQueryClient()
  const { toast } = useToast()
  const panelLogoRef = useRef(null)

  const panelLogoDeleteMutation = useMutation({
    mutationFn: (id) => suppliersService.deleteLogo(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast({ title: 'Logo removed', variant: 'success' }) },
    onError:   (e) => toast({ title: e.response?.data?.message || 'Remove failed', variant: 'error' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => suppliersService.update(id, data),
    onSuccess: async (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      qc.invalidateQueries({ queryKey: ['supplier-performance', selectedId] })
      if (panelLogoRef.current) {
        try {
          await suppliersService.uploadLogo(id, panelLogoRef.current)
          qc.invalidateQueries({ queryKey: ['suppliers'] })
        } catch { /* non-fatal */ }
        panelLogoRef.current = null
      }
      toast({ title: 'Supplier updated', variant: 'success' })
      setEditFromPanel(null)
    },
    onError: (e) => toast({ title: e.response?.data?.message || 'Failed', variant: 'error' }),
  })

  const TABS = [
    { id: 'list',      icon: Truck,    label: 'Suppliers' },
    { id: 'dashboard', icon: Activity, label: 'Dashboard' },
    { id: 'analytics', icon: BarChart2,label: 'Analytics' },
  ]

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        icon={Truck}
        eyebrow="Catalog"
        title="Supplier Management"
        subtitle="Monitor performance, analytics and purchase history across all suppliers"
      />

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all"
            style={{
              background: tab === t.id ? 'var(--brand-primary)' : 'transparent',
              color:      tab === t.id ? '#fff' : 'var(--text-muted)',
              boxShadow:  tab === t.id ? 'var(--shadow-xs)' : 'none',
            }}>
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'list'      && <ListView onSelectSupplier={setSelect} can={can} />}
      {tab === 'dashboard' && <DashboardView />}
      {tab === 'analytics' && <AnalyticsView />}

      {/* Detail panel */}
      <AnimatePresence>
        {selectedId && (
          <DetailPanel
            supplierId={selectedId}
            onClose={() => setSelect(null)}
            onEdit={can('inventory_manager') ? (s) => setEditFromPanel(s) : null}
          />
        )}
      </AnimatePresence>

      {/* Edit modal from detail panel */}
      <Modal open={!!editingFromPanel} title="Edit Supplier" onClose={() => { setEditFromPanel(null); panelLogoRef.current = null }}>
        {editingFromPanel && (
          <SupplierForm
            defaultValues={editingFromPanel}
            onSubmit={(d) => updateMutation.mutate({ id: editingFromPanel._id, data: d })}
            isPending={updateMutation.isPending}
            submitLabel="Save Changes"
            currentLogo={editingFromPanel.logo || null}
            onLogoSelect={(f) => { panelLogoRef.current = f }}
            onLogoRemove={() => {
              if (editingFromPanel.logo) panelLogoDeleteMutation.mutate(editingFromPanel._id)
              else panelLogoRef.current = null
            }}
            logoUploading={panelLogoDeleteMutation.isPending}
          />
        )}
      </Modal>
    </div>
  )
}
