import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import {
  ArrowLeft, Package, Edit2, Brain, AlertTriangle, CheckCircle,
  XCircle, TrendingDown, TrendingUp, Truck, ShoppingBag,
  ShoppingCart, Activity, RefreshCw, Calendar, MapPin,
  BarChart2, Layers, Target, Award, Clock, Zap,
  ChevronDown, ChevronUp, Phone, Mail, Tag, Minus,
} from 'lucide-react'
import { productsService } from '@/services/productsService'
import { aiService } from '@/services/aiService'
import { useRole } from '@/hooks/useRole'
import { useToast } from '@/hooks/useToast'
import { useMutation } from '@tanstack/react-query'
import { formatCurrency, formatNumber, formatDate, formatRelativeTime, getProductImage, imgFallback } from '@/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtRs  = v  => formatCurrency ? formatCurrency(v ?? 0) : `Rs. ${(+(v ?? 0)).toLocaleString()}`
const fmtNum = v  => formatNumber   ? formatNumber(v ?? 0)   : (+(v ?? 0)).toLocaleString()
const fmtDt  = v  => formatDate     ? formatDate(v)          : v ? new Date(v).toLocaleDateString() : '—'
const fmtRel = v  => formatRelativeTime ? formatRelativeTime(v) : fmtDt(v)
const pct    = v  => v != null ? `${(+v).toFixed(1)}%` : '—'

// ── Stock status config ───────────────────────────────────────────────────────
const SS = {
  out_of_stock: { label: 'Out of Stock', color: '#EF4444', bg: 'rgba(239,68,68,.12)', Icon: XCircle },
  critical:     { label: 'Critical',     color: '#F59E0B', bg: 'rgba(245,158,11,.12)', Icon: AlertTriangle },
  overstock:    { label: 'Overstock',    color: '#6366F1', bg: 'rgba(99,102,241,.12)', Icon: TrendingDown },
  healthy:      { label: 'Healthy',      color: '#10B981', bg: 'rgba(16,185,129,.12)', Icon: CheckCircle },
}

const RISK = {
  high:   { color: '#EF4444', bg: 'rgba(239,68,68,.10)',  label: 'High Risk'   },
  medium: { color: '#F59E0B', bg: 'rgba(245,158,11,.10)', label: 'Medium Risk' },
  low:    { color: '#10B981', bg: 'rgba(16,185,129,.10)', label: 'Low Risk'    },
}

const MOV_TYPE = {
  purchase:   { label: 'Purchase',   color: '#10B981', sign: '+' },
  sale:       { label: 'Sale',       color: '#EF4444', sign: '−' },
  adjustment: { label: 'Adjustment', color: '#F59E0B', sign: '~' },
  return:     { label: 'Return',     color: '#2563EB', sign: '+' },
  waste:      { label: 'Waste',      color: '#6B7280', sign: '−' },
  transfer:   { label: 'Transfer',   color: '#8B5CF6', sign: '→' },
}

const PO_STATUS = {
  ordered:  { color: '#2563EB', label: 'Ordered'  },
  received: { color: '#10B981', label: 'Received' },
  partial:  { color: '#F59E0B', label: 'Partial'  },
  cancelled:{ color: '#6B7280', label: 'Cancelled'},
}

const PAY_STATUS = {
  paid:    { color: '#10B981', label: 'Paid'    },
  partial: { color: '#F59E0B', label: 'Partial' },
  pending: { color: '#EF4444', label: 'Pending' },
}

const ALERT_PRI = {
  critical: '#EF4444', high: '#F97316', medium: '#F59E0B', low: '#10B981',
}

// ── Sub-components ────────────────────────────────────────────────────────────
function ConfidenceRing({ value, color = '#2563EB' }) {
  const r    = 28
  const circ = 2 * Math.PI * r
  const dash = ((Math.min(100, value ?? 0)) / 100) * circ
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0">
      <circle cx="36" cy="36" r={r} fill="none"
        stroke="var(--surface-muted)" strokeWidth="6" />
      <circle cx="36" cy="36" r={r} fill="none"
        stroke={color} strokeWidth="6"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 36 36)" />
      <text x="36" y="40" textAnchor="middle" fontSize="13"
        fontWeight="bold" fill={color}>
        {value != null ? `${value}%` : '—'}
      </text>
    </svg>
  )
}

function KpiTile({ icon: Icon, label, value, sub, color = '#2563EB', small }) {
  return (
    <div className="rounded-xl p-4 flex items-start gap-3"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
      <div className="p-2 rounded-lg shrink-0" style={{ background: `${color}1a` }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className={`font-bold leading-tight ${small ? 'text-[16px]' : 'text-[20px]'}`}
          style={{ color: 'var(--text-primary)' }}>{value ?? '—'}</p>
        {sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
    </div>
  )
}

function InfoRow({ label, value, mono }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-start justify-between py-2 border-b last:border-b-0"
      style={{ borderColor: 'var(--border)' }}>
      <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
      {mono
        ? <code className="text-[11px] px-1.5 py-0.5 rounded"
            style={{ background: 'var(--surface-muted)', color: 'var(--text-primary)' }}>{value}</code>
        : <span className="text-[12px] font-semibold text-right max-w-48"
            style={{ color: 'var(--text-primary)' }}>{value}</span>
      }
    </div>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-3 py-2 text-[12px] shadow-lg"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
      <p className="font-semibold mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color ?? p.stroke }}>
          {p.name}: {typeof p.value === 'number' && p.value > 100
            ? fmtRs(p.value) : fmtNum(p.value)}
        </p>
      ))}
    </div>
  )
}

function StatusBadge({ status, map }) {
  const cfg = map[status]
  if (!cfg) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: `${cfg.color}22`, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ProductDetailPage() {
  const { id }          = useParams()
  const navigate        = useNavigate()
  const { can, prefix, isManager } = useRole()
  const { toast }       = useToast()
  const qc              = useQueryClient()
  const [histTab, setHistTab] = useState('movements')
  const [showFullExplan, setShowFull] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['product-detail', id],
    queryFn:  () => productsService.getDetail(id).then(r => r.data?.data),
    staleTime: 60_000,
    enabled: !!id,
  })

  const { data: healthData } = useQuery({
    queryKey: ['ai-health'],
    queryFn:  () => aiService.getHealth().then(r => r.data?.data || r.data),
    staleTime: 30_000,
    retry: false,
  })
  const aiOnline = healthData?.online !== false

  const analyzeMutation = useMutation({
    mutationFn: () => aiService.refreshProductPrediction(id),
    onSuccess:  () => {
      toast({ title: 'AI analysis started', variant: 'success' })
      setTimeout(() => qc.invalidateQueries({ queryKey: ['product-detail', id] }), 5000)
    },
    onError: () => toast({ title: 'AI service unavailable', variant: 'error' }),
  })

  // ── Loading / error states ──────────────────────────────────────────────────
  if (isLoading) return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="h-8 w-48 rounded-lg animate-pulse" style={{ background: 'var(--surface-muted)' }} />
      <div className="h-48 rounded-xl animate-pulse" style={{ background: 'var(--surface-card)' }} />
      <div className="grid grid-cols-3 gap-4">
        {[1,2,3,4,5,6].map(i => (
          <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: 'var(--surface-card)' }} />
        ))}
      </div>
    </div>
  )

  if (isError || !data) return (
    <div className="flex flex-col items-center justify-center py-24">
      <XCircle className="h-12 w-12 mb-3" style={{ color: '#EF4444' }} />
      <p className="text-[16px] font-semibold" style={{ color: 'var(--text-primary)' }}>Product not found</p>
      <button onClick={() => navigate(-1)}
        className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg text-[13px]"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
        <ArrowLeft className="h-4 w-4" /> Go Back
      </button>
    </div>
  )

  const { product, prediction, stockMovements, salesHistory, purchaseHistory, salesTrend, alerts, metrics } = data

  const ss  = SS[product.stockStatus]   || SS.healthy
  const rsk = RISK[prediction?.inventoryRisk] || RISK.low

  // Forecast chart data
  const forecastData = (prediction?.forecastData || []).slice(0, 30).map(d => ({
    date:   d.date?.slice(5) || '',
    demand: Math.max(0, Math.round(d.demand ?? d.yhat ?? 0)),
    lower:  Math.max(0, Math.round(d.lower  ?? d.yhat_lower ?? 0)),
    upper:  Math.max(0, Math.round(d.upper  ?? d.yhat_upper ?? 0)),
  }))

  // Trend icon
  const trend = prediction?.demandTrend
  const TrendIcon = trend === 'increasing' || trend === 'rising'
    ? TrendingUp
    : trend === 'decreasing' || trend === 'falling'
    ? TrendingDown : Minus
  const trendColor = trend === 'increasing' || trend === 'rising'
    ? '#EF4444'
    : trend === 'decreasing' || trend === 'falling'
    ? '#10B981' : 'var(--text-muted)'

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto pb-12">

      {/* ── Breadcrumb + Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`${prefix}/products`)}
            className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-card)'}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[20px] font-bold" style={{ color: 'var(--text-primary)' }}>
                {product.name}
              </h1>
              <code className="text-[11px] px-2 py-0.5 rounded"
                style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
                {product.sku}
              </code>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: ss.bg, color: ss.color }}>
                <ss.Icon className="h-3 w-3" /> {ss.label}
              </span>
              {alerts.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(239,68,68,.1)', color: '#EF4444' }}>
                  <AlertTriangle className="h-3 w-3" /> {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {product.brand && (
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {product.brand}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending || !aiOnline}
            title={!aiOnline ? 'AI service is offline' : undefined}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium disabled:opacity-40"
            style={{ background: 'rgba(37,99,235,.1)', color: '#2563EB' }}>
            <Brain className="h-3.5 w-3.5" />
            {analyzeMutation.isPending ? 'Analyzing…' : !aiOnline ? 'AI Offline' : 'Run AI Analysis'}
          </button>
          {can('inventory_manager') && (
            <button onClick={() => navigate(`${prefix}/products?edit=${id}`)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <Edit2 className="h-3.5 w-3.5" /> Edit
            </button>
          )}
        </div>
      </div>

      {/* ── Hero: Image + Info ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Product Image */}
        <div className="rounded-xl overflow-hidden flex flex-col"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <div className="flex-1 min-h-48">
            <img src={getProductImage(product)} alt={product.name}
              className="w-full h-full object-cover" onError={imgFallback} />
          </div>
          {product.description && (
            <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {product.description}
              </p>
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="rounded-xl p-5"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <h3 className="text-[13px] font-bold mb-3 flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}>
            <Tag className="h-4 w-4" style={{ color: '#2563EB' }} /> Product Details
          </h3>
          <div>
            <InfoRow label="Category"     value={product.category?.name || '—'} />
            <InfoRow label="Brand"        value={product.brand || '—'} />
            <InfoRow label="Unit"         value={product.unit} />
            <InfoRow label="SKU"          value={product.sku} mono />
            <InfoRow label="Barcode"      value={product.barcode} mono />
            <InfoRow label="Location"     value={product.storageLocation} />
            {product.isPerishable && (
              <InfoRow label="Shelf Life"
                value={product.expiryDate ? `Expires ${fmtDt(product.expiryDate)}` : 'Perishable'} />
            )}
            <InfoRow label="Buying Price"  value={fmtRs(product.buyingPrice)} />
            <InfoRow label="Selling Price" value={fmtRs(product.sellingPrice)} />
            <InfoRow label="Profit Margin" value={`${metrics.profitMargin}%`} />
            <InfoRow label="Stock Value"   value={fmtRs(metrics.stockValue)} />
            <InfoRow label="Min Stock"     value={`${fmtNum(product.minStock)} ${product.unit}`} />
            <InfoRow label="Max Stock"     value={`${fmtNum(product.maxStock)} ${product.unit}`} />
            <InfoRow label="Reorder Level" value={`${fmtNum(product.reorderLevel)} ${product.unit}`} />
          </div>
        </div>

        {/* Supplier + Delivery Info */}
        <div className="rounded-xl p-5"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <h3 className="text-[13px] font-bold mb-3 flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}>
            <Truck className="h-4 w-4" style={{ color: '#10B981' }} /> Supplier & Delivery
          </h3>
          {product.supplier ? (
            <div className="mb-4">
              <div className="flex items-center gap-3 p-3 rounded-lg mb-3"
                style={{ background: 'var(--surface-muted)' }}>
                <div className="h-10 w-10 rounded-full flex items-center justify-center text-[14px] font-bold shrink-0"
                  style={{ background: 'rgba(16,185,129,.15)', color: '#10B981' }}>
                  {(product.supplier.name || 'S')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                    {product.supplier.name}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {product.supplier.status || 'Active supplier'}
                  </p>
                </div>
              </div>
              {product.supplier.phone && (
                <div className="flex items-center gap-2 text-[12px] mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  <Phone className="h-3.5 w-3.5 shrink-0" /> {product.supplier.phone}
                </div>
              )}
              {product.supplier.email && (
                <div className="flex items-center gap-2 text-[12px] mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  <Mail className="h-3.5 w-3.5 shrink-0" /> {product.supplier.email}
                </div>
              )}
              {product.supplier.address && (
                <div className="flex items-start gap-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {product.supplier.address}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-6 rounded-lg mb-4"
              style={{ background: 'var(--surface-muted)' }}>
              <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No supplier assigned</p>
            </div>
          )}
          <div className="space-y-0 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            <InfoRow label="Lead Time"          value={`${metrics.leadTimeDays} days`} />
            <InfoRow label="Expected Delivery"  value={fmtDt(metrics.expectedDelivery)} />
            {metrics.pendingPO && (
              <InfoRow label="Open PO"
                value={`${metrics.pendingPO.number} (${metrics.pendingPO.status})`} />
            )}
            <InfoRow label="Last Purchase"   value={metrics.lastPurchaseDate ? fmtRel(metrics.lastPurchaseDate) : '—'} />
            <InfoRow label="Last Sale"       value={metrics.lastSaleDate     ? fmtRel(metrics.lastSaleDate)     : '—'} />
          </div>
        </div>
      </div>

      {/* ── KPI Tiles ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiTile icon={Layers}      label="Current Stock"      color={ss.color}
          value={`${fmtNum(product.currentStock)} ${product.unit}`}
          sub={ss.label} />
        <KpiTile icon={Target}      label="Safety Stock"       color="#8B5CF6"
          value={prediction?.safetyStock != null ? `${fmtNum(prediction.safetyStock)} ${product.unit}` : '—'}
          sub="Buffer stock" />
        <KpiTile icon={AlertTriangle} label="Reorder Point"    color="#F59E0B"
          value={`${fmtNum(prediction?.reorderPoint ?? product.reorderLevel)} ${product.unit}`}
          sub="Trigger level" />
        <KpiTile icon={ShoppingCart}  label="Suggested Purchase" color="#10B981"
          value={prediction?.suggestedPurchase != null ? `${fmtNum(prediction.suggestedPurchase)} ${product.unit}` : '—'}
          sub={prediction?.eoq ? `EOQ: ${fmtNum(prediction.eoq)}` : 'No AI data'} />
        <KpiTile icon={Clock}       label="Days of Stock"      color="#2563EB"
          value={prediction?.daysOfStock != null ? `${prediction.daysOfStock}d` : '—'}
          sub={`Lead: ${metrics.leadTimeDays}d`}
          small={false} />
        <KpiTile icon={Award}       label="Profit Margin"      color="#F59E0B"
          value={`${metrics.profitMargin}%`}
          sub={`Turnover: ${metrics.inventoryTurnover ?? '—'}x/yr`} />
      </div>

      {/* ── AI Analysis ──────────────────────────────────────────────────────── */}
      {prediction ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl p-5"
          style={{ background: 'var(--surface-card)', border: `1px solid ${rsk.color}40` }}>
          <div className="flex items-start gap-5 flex-wrap">

            {/* Confidence ring + risk */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              <ConfidenceRing value={prediction.confidenceScore} color={rsk.color} />
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: rsk.bg, color: rsk.color }}>
                {rsk.label}
              </span>
            </div>

            {/* Explanation + metrics */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="h-4 w-4" style={{ color: '#2563EB' }} />
                <h3 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
                  AI Analysis
                </h3>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  · {prediction.analyzedAt ? fmtRel(prediction.analyzedAt) : 'Unknown'}
                </span>
                {!prediction.hasHistoricalData && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(245,158,11,.15)', color: '#F59E0B' }}>
                    Limited data
                  </span>
                )}
              </div>

              {prediction.explanation && (
                <div className="mb-3">
                  <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    {showFullExplan ? prediction.explanation : prediction.explanation.slice(0, 220)}
                    {prediction.explanation.length > 220 && (
                      <button onClick={() => setShowFull(s => !s)}
                        className="ml-1 font-medium" style={{ color: '#2563EB' }}>
                        {showFullExplan ? 'Show less' : '…Read more'}
                      </button>
                    )}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: '30d Forecast',   value: prediction.forecastDemand != null ? `${Math.round(prediction.forecastDemand)} ${product.unit}` : '—', color: '#2563EB' },
                  { label: 'Daily Demand',   value: prediction.dailyDemand != null ? `${(+prediction.dailyDemand).toFixed(1)}/day` : '—', color: '#8B5CF6' },
                  { label: 'Stockout Risk',  value: pct(prediction.stockoutProbability),  color: '#EF4444' },
                  { label: 'Overstock Risk', value: pct(prediction.overstockProbability), color: '#F59E0B' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="px-3 py-2.5 rounded-lg"
                    style={{ background: `${color}0d` }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5"
                      style={{ color }}>
                      {label}
                    </p>
                    <p className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Demand trend */}
            <div className="flex flex-col items-center gap-1 shrink-0 px-4 py-3 rounded-xl"
              style={{ background: 'var(--surface-muted)' }}>
              <TrendIcon className="h-6 w-6" style={{ color: trendColor }} />
              <span className="text-[11px] font-bold" style={{ color: trendColor }}>
                {trend ? trend.charAt(0).toUpperCase() + trend.slice(1) : 'Unknown'}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Demand Trend</span>
            </div>
          </div>
        </motion.div>
      ) : (
        <div className="rounded-xl p-6 flex items-center gap-4"
          style={{ background: 'var(--surface-card)', border: '1px dashed var(--border)' }}>
          <Brain className="h-10 w-10 shrink-0 opacity-30" style={{ color: 'var(--text-muted)' }} />
          <div>
            <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              No AI analysis available
            </p>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Click "Run AI Analysis" to generate forecast, safety stock, reorder point and risk metrics.
            </p>
          </div>
          <button onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending || !aiOnline}
            title={!aiOnline ? 'AI service is offline' : undefined}
            className="ml-auto shrink-0 px-4 py-2 rounded-lg text-[12px] font-bold disabled:opacity-40"
            style={{ background: '#2563EB', color: '#fff' }}>
            {analyzeMutation.isPending ? 'Running…' : !aiOnline ? 'AI Offline' : 'Analyze Now'}
          </button>
        </div>
      )}

      {/* ── Charts ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Sales Trend — 90 days */}
        <div className="lg:col-span-2 rounded-xl p-5"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
                Sales History
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Daily units sold · last 90 days
              </p>
            </div>
            <div className="text-right">
              <p className="text-[18px] font-bold" style={{ color: '#10B981' }}>
                {fmtNum(metrics.totalQtySold30d)} <span className="text-[12px] font-normal">{product.unit}</span>
              </p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>sold last 30 days</p>
            </div>
          </div>
          {salesTrend.length === 0 ? (
            <div className="flex items-center justify-center py-16 rounded-xl"
              style={{ background: 'var(--surface-muted)' }}>
              <div className="text-center">
                <BarChart2 className="h-8 w-8 mx-auto mb-2 opacity-30" style={{ color: 'var(--text-muted)' }} />
                <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No sales data yet</p>
              </div>
            </div>
          ) : (
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesTrend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false}
                    tickFormatter={d => d?.slice(5)} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="quantity" name="Units Sold" fill="#2563EB" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Forecast Chart */}
        <div className="rounded-xl p-5"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
                30-Day Forecast
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                AI demand prediction with 90% band
              </p>
            </div>
          </div>
          {forecastData.length === 0 ? (
            <div className="flex items-center justify-center py-16 rounded-xl"
              style={{ background: 'var(--surface-muted)' }}>
              <div className="text-center">
                <Brain className="h-8 w-8 mx-auto mb-2 opacity-30" style={{ color: 'var(--text-muted)' }} />
                <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Run AI to see forecast</p>
              </div>
            </div>
          ) : (
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecastData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fcBand" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#8B5CF6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false}
                    interval={4} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area dataKey="upper"  name="Upper"    stroke="none" fill="url(#fcBand)" />
                  <Area dataKey="lower"  name="Lower"    stroke="none" fill="white"        fillOpacity={1} />
                  <Area dataKey="demand" name="Forecast" stroke="#8B5CF6" strokeWidth={2}
                    fill="none" dot={false} />
                  {prediction?.reorderPoint && (
                    <ReferenceLine y={prediction.reorderPoint} stroke="#F59E0B"
                      strokeDasharray="4 2" label={{ value: 'ROP', fontSize: 9, fill: '#F59E0B' }} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          {forecastData.length > 0 && (
            <div className="mt-3 flex gap-3 text-[10px]">
              <span className="flex items-center gap-1" style={{ color: '#8B5CF6' }}>
                <span className="h-0.5 w-4 inline-block bg-current" /> Forecast
              </span>
              <span className="flex items-center gap-1" style={{ color: '#8B5CF6', opacity: .5 }}>
                <span className="h-3 w-4 inline-block rounded opacity-30 bg-current" /> 90% Band
              </span>
              <span className="flex items-center gap-1" style={{ color: '#F59E0B' }}>
                <span className="h-0.5 w-4 inline-block bg-current" style={{ borderTop: '2px dashed #F59E0B' }} /> Reorder
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Performance Metrics ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: ShoppingBag,  label: 'Revenue (30d)',       value: fmtRs(metrics.totalRevenue30d),    color: '#10B981' },
          { icon: ShoppingCart, label: 'Purchased (All-time)',value: `${fmtNum(metrics.totalQtyPurchased)} ${product.unit}`, color: '#2563EB' },
          { icon: Activity,     label: 'Turnover Rate',       value: metrics.inventoryTurnover != null ? `${metrics.inventoryTurnover}×/yr` : '—', color: '#8B5CF6' },
          { icon: Zap,          label: 'Avg Buy Price',       value: fmtRs(metrics.avgBuyingPrice),     color: '#F59E0B' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="rounded-xl p-4"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className="h-4 w-4" style={{ color }} />
              <span className="text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-muted)' }}>{label}</span>
            </div>
            <p className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── History Tabs ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>

        {/* Tab strip */}
        <div className="flex border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}>
          {[
            { key: 'movements', label: 'Stock Movements', count: stockMovements.length, icon: Activity },
            { key: 'sales',     label: 'Sales History',   count: salesHistory.length,   icon: ShoppingBag },
            { key: 'purchases', label: 'Purchase History',count: purchaseHistory.length, icon: ShoppingCart },
          ].map(({ key, label, count, icon: Icon }) => (
            <button key={key} onClick={() => setHistTab(key)}
              className="flex items-center gap-1.5 px-4 py-3 text-[13px] font-medium border-b-2 transition-colors"
              style={histTab === key
                ? { borderColor: '#2563EB', color: '#2563EB', background: 'var(--surface-card)' }
                : { borderColor: 'transparent', color: 'var(--text-muted)' }}>
              <Icon className="h-3.5 w-3.5" />
              {label}
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                style={{ background: histTab === key ? 'rgba(37,99,235,.12)' : 'var(--surface-muted)',
                         color: histTab === key ? '#2563EB' : 'var(--text-muted)' }}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Stock Movements */}
        <AnimatePresence mode="wait">
          {histTab === 'movements' && (
            <motion.div key="movements"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {stockMovements.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>No stock movements recorded</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                        {['Date', 'Type', 'Qty', 'Before', 'After', 'Reference', 'By', 'Notes'].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 font-semibold text-[10px] uppercase tracking-wider"
                            style={{ color: 'var(--text-muted)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stockMovements.map((m, i) => {
                        const mt = MOV_TYPE[m.type] || { label: m.type, color: '#6B7280', sign: '~' }
                        const isIn = ['purchase', 'return'].includes(m.type)
                        return (
                          <tr key={m._id || i} className="border-b last:border-b-0"
                            style={{ borderColor: 'var(--border)' }}>
                            <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                              {fmtDt(m.date)}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                style={{ background: `${mt.color}20`, color: mt.color }}>
                                {mt.label}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-bold"
                              style={{ color: isIn ? '#10B981' : '#EF4444' }}>
                              {isIn ? '+' : '−'}{Math.abs(m.quantity)}
                            </td>
                            <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>
                              {fmtNum(m.stockBefore)}
                            </td>
                            <td className="px-4 py-2.5 font-semibold" style={{ color: 'var(--text-primary)' }}>
                              {fmtNum(m.stockAfter)}
                            </td>
                            <td className="px-4 py-2.5">
                              <code className="text-[10px] px-1.5 py-0.5 rounded"
                                style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
                                {m.reference || '—'}
                              </code>
                            </td>
                            <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>
                              {m.recordedBy?.fullName || '—'}
                            </td>
                            <td className="px-4 py-2.5 max-w-32 truncate" style={{ color: 'var(--text-muted)' }}>
                              {m.notes || '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}

          {/* Sales History */}
          {histTab === 'sales' && (
            <motion.div key="sales"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {salesHistory.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>No sales recorded for this product</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                        {['Date', 'Invoice', 'Customer', 'Qty', 'Unit Price', 'Line Total', 'Status'].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 font-semibold text-[10px] uppercase tracking-wider"
                            style={{ color: 'var(--text-muted)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {salesHistory.map((s, i) => (
                        <tr key={s._id || i} className="border-b last:border-b-0"
                          style={{ borderColor: 'var(--border)' }}>
                          <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                            {fmtDt(s.saleDate)}
                          </td>
                          <td className="px-4 py-2.5">
                            <code className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
                              {s.invoiceNumber}
                            </code>
                          </td>
                          <td className="px-4 py-2.5" style={{ color: 'var(--text-primary)' }}>
                            {s.customerName || 'Walk-in'}
                          </td>
                          <td className="px-4 py-2.5 font-bold" style={{ color: '#EF4444' }}>
                            −{fmtNum(s.quantity)}
                          </td>
                          <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>
                            {fmtRs(s.unitPrice)}
                          </td>
                          <td className="px-4 py-2.5 font-semibold" style={{ color: '#10B981' }}>
                            {fmtRs(s.lineTotal)}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{
                                background: s.status === 'completed' ? 'rgba(16,185,129,.12)' :
                                            s.status === 'refunded'  ? 'rgba(245,158,11,.12)' :
                                            'rgba(107,114,128,.12)',
                                color: s.status === 'completed' ? '#10B981' :
                                       s.status === 'refunded'  ? '#F59E0B' : '#6B7280',
                              }}>
                              {s.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}

          {/* Purchase History */}
          {histTab === 'purchases' && (
            <motion.div key="purchases"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {purchaseHistory.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>No purchases recorded for this product</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                        {['Date', 'PO #', 'Supplier', 'Qty', 'Buy Price', 'Line Total', 'Status', 'Payment'].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 font-semibold text-[10px] uppercase tracking-wider"
                            style={{ color: 'var(--text-muted)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseHistory.map((p, i) => (
                        <tr key={p._id || i} className="border-b last:border-b-0"
                          style={{ borderColor: 'var(--border)' }}>
                          <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                            {fmtDt(p.purchaseDate)}
                          </td>
                          <td className="px-4 py-2.5">
                            <code className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
                              {p.purchaseNumber}
                            </code>
                          </td>
                          <td className="px-4 py-2.5" style={{ color: 'var(--text-primary)' }}>
                            {p.supplierName || '—'}
                          </td>
                          <td className="px-4 py-2.5 font-bold" style={{ color: '#10B981' }}>
                            +{fmtNum(p.quantity)}
                          </td>
                          <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>
                            {fmtRs(p.buyingPrice)}
                          </td>
                          <td className="px-4 py-2.5 font-semibold" style={{ color: '#2563EB' }}>
                            {fmtRs(p.lineTotal)}
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusBadge status={p.status} map={PO_STATUS} />
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusBadge status={p.paymentStatus} map={PAY_STATUS} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Alerts ───────────────────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="rounded-xl p-5"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <h3 className="text-[13px] font-bold mb-3 flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}>
            <AlertTriangle className="h-4 w-4" style={{ color: '#EF4444' }} />
            Active Alerts
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(239,68,68,.1)', color: '#EF4444' }}>
              {alerts.length}
            </span>
          </h3>
          <div className="space-y-2">
            {alerts.map((a, i) => {
              const priColor = ALERT_PRI[a.priority] || '#F59E0B'
              return (
                <div key={a._id || i}
                  className="flex items-start gap-3 p-3 rounded-lg"
                  style={{ background: 'var(--surface-muted)', borderLeft: `3px solid ${priColor}` }}>
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: priColor }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {a.title}
                      </p>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase"
                        style={{ background: `${priColor}20`, color: priColor }}>
                        {a.priority}
                      </span>
                      {!a.isRead && (
                        <span className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ background: priColor }} />
                      )}
                    </div>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{a.message}</p>
                  </div>
                  <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {fmtRel(a.createdAt)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
