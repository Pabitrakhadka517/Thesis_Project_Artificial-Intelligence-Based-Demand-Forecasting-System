import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Package, TrendingUp, AlertTriangle,
  Clock, Layers, Tag, Truck,
} from 'lucide-react'
import { inventoryService } from '@/services/inventoryService'
import { forecastService } from '@/services/forecastService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/common/Card'
import { AreaChart } from '@/components/charts/AreaChart'
import { SkeletonChart } from '@/components/common/Skeleton'
import { ErrorState } from '@/components/common/ErrorState'
import { formatNumber, formatDate } from '@/utils'

const STATUS_COLORS = {
  healthy:      '#22C55E',
  low:          '#F59E0B',
  critical:     '#EF4444',
  overstock:    '#6366F1',
  out_of_stock: '#94A3B8',
}
const STATUS_LABELS = {
  healthy:      'Healthy',
  low:          'Low Stock',
  critical:     'Critical',
  overstock:    'Overstock',
  out_of_stock: 'Out of Stock',
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || '#94A3B8'
  const label = STATUS_LABELS[status] || status || '—'
  return (
    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
      style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
      {label}
    </span>
  )
}

function MetricRow({ label, value, color, divider = true }) {
  return (
    <div className="flex items-center justify-between py-2.5"
      style={{ borderBottom: divider ? '1px solid var(--border-subtle)' : 'none' }}>
      <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
      {typeof value === 'string' || typeof value === 'number' || value == null
        ? <span className="text-[13px] font-semibold num" style={{ color: color || 'var(--text-primary)' }}>{value ?? '—'}</span>
        : value
      }
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="rounded-xl p-4" style={{
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${color}`,
    }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${color}18` }}>
          <Icon style={{ width: 14, height: 14, color }} />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>
      </div>
      <p className="text-[24px] font-bold num leading-none" style={{ color }}>{value ?? '—'}</p>
      {sub && <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

export default function ProductDetailPage() {
  const { productId } = useParams()

  // Load the enriched inventory row for this SKU (has stock + rec + supplier data)
  const { data: invData, isLoading, error } = useQuery({
    queryKey: ['inventory', 'enriched', 'detail', productId],
    queryFn: () =>
      inventoryService.getProducts({ page: 1, pageSize: 200 }).then(r => {
        const item = (r.data?.data || []).find(i => String(i.sku_id) === String(productId))
        return item || null
      }),
    enabled: !!productId,
  })

  // Load SKU details (category, unit, perishable, shelf_life, supplier_id)
  const { data: skuData } = useQuery({
    queryKey: ['sku', productId],
    queryFn: () => inventoryService.getProduct(productId).then(r => r.data),
    enabled: !!productId,
  })

  // Load 30-day forecast
  const { data: forecastRaw, isLoading: forecastLoading } = useQuery({
    queryKey: ['forecast', 'product', productId],
    queryFn: () => forecastService.getProductForecast(productId, { days: 30 }).then(r => r.data),
    enabled: !!productId,
  })

  const forecastItems = Array.isArray(forecastRaw) ? forecastRaw : []
  const forecast30d   = forecastItems.reduce((s, f) => s + f.predicted_qty, 0)
  const forecast7d    = forecastItems.slice(0, 7).reduce((s, f) => s + f.predicted_qty, 0)
  const forecastChart = forecastItems.map(f => ({
    date:        f.forecast_date,
    forecast:    f.predicted_qty,
    upper_bound: parseFloat((f.predicted_qty * 1.15).toFixed(2)),
    lower_bound: parseFloat((f.predicted_qty * 0.85).toFixed(2)),
  }))

  if (isLoading) {
    return (
      <div className="space-y-5 pb-6">
        <div className="h-6 w-40 rounded animate-pulse" style={{ background: 'var(--surface-muted)' }} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }} />
          ))}
        </div>
      </div>
    )
  }

  if (error || (!isLoading && !invData && !skuData)) {
    return <ErrorState error={error || new Error('Product not found')} title="Product not found" />
  }

  const product = invData || {}
  const sku     = skuData || {}
  const statusColor = STATUS_COLORS[product.stock_status] || '#94A3B8'

  return (
    <div className="space-y-5 pb-6">
      {/* Back */}
      <Link
        to="/inventory"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Inventory
      </Link>

      {/* Product header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl p-5 flex items-start gap-4"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', borderLeft: `4px solid ${statusColor}` }}
      >
        <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${statusColor}15` }}>
          <Package style={{ width: 22, height: 22, color: statusColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[20px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {product.name || sku.name || `SKU #${productId}`}
            </h1>
            <StatusBadge status={product.stock_status} />
          </div>
          <div className="flex items-center gap-3 flex-wrap mt-1">
            {(product.category || sku.category) && (
              <span className="text-[12px] px-2 py-0.5 rounded-full"
                style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)' }}>
                {product.category || sku.category}
              </span>
            )}
            {(product.unit || sku.unit) && (
              <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                Unit: {product.unit || sku.unit}
              </span>
            )}
            {(sku.is_perishable) && (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                style={{ background: 'rgba(239,68,68,.1)', color: '#EF4444' }}>
                Perishable
              </span>
            )}
            <span className="text-[12px] font-mono" style={{ color: 'var(--text-muted)' }}>
              SKU #{productId}
            </span>
          </div>
        </div>
      </motion.div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={Layers}      color={statusColor}
          label="Current Stock"
          value={formatNumber(product.current_stock)}
          sub={product.unit ? `${product.unit}s on hand` : 'units on hand'}
        />
        <MetricCard
          icon={AlertTriangle} color="#F59E0B"
          label="Reorder Point"
          value={formatNumber(product.reorder_point)}
          sub="trigger restock below this"
        />
        <MetricCard
          icon={TrendingUp}  color="#8B5CF6"
          label="30-Day Forecast"
          value={forecastLoading ? '…' : formatNumber(Math.round(forecast30d))}
          sub={forecastLoading ? 'loading' : `7d: ${formatNumber(Math.round(forecast7d))} units`}
        />
        <MetricCard
          icon={Truck}       color="#14B8A6"
          label="Lead Time"
          value={product.lead_time_days != null ? `${product.lead_time_days}d` : '—'}
          sub="supplier delivery window"
        />
      </div>

      {/* ── Detail cards row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Stock */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4" style={{ color: '#2563EB' }} />
              <CardTitle>Stock Levels</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-1">
            <MetricRow label="Current Stock"           value={`${formatNumber(product.current_stock)} units`} color={statusColor} />
            <MetricRow label="Safety Stock"            value={product.safety_stock != null ? `${formatNumber(product.safety_stock)} units` : null} />
            <MetricRow label="Reorder Point"           value={product.reorder_point != null ? `${formatNumber(product.reorder_point)} units` : null} />
            <MetricRow label="Rec. Purchase Qty"       value={product.recommended_purchase_qty != null ? `${formatNumber(product.recommended_purchase_qty)} units` : null} />
            <div className="pt-1">
              <MetricRow label="Status" value={<StatusBadge status={product.stock_status} />} divider={false} />
            </div>
          </CardContent>
        </Card>

        {/* Forecast summary */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" style={{ color: '#8B5CF6' }} />
              <CardTitle>Forecast Summary</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-1">
            <MetricRow label="7-Day Forecast"  value={forecastLoading ? '…' : `${formatNumber(Math.round(forecast7d))} units`} />
            <MetricRow label="30-Day Forecast" value={forecastLoading ? '…' : `${formatNumber(Math.round(forecast30d))} units`} />
            <MetricRow label="Model Version"   value={forecastItems[0]?.model_version || '—'} />
            <MetricRow label="Data Points"     value={forecastItems.length ? `${forecastItems.length} days` : '—'} />
            <MetricRow label="Generated"
              value={forecastItems[0]?.generated_at ? formatDate(forecastItems[0].generated_at) : '—'}
            />
          </CardContent>
        </Card>

        {/* Product details */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4" style={{ color: '#F59E0B' }} />
              <CardTitle>Product Details</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-1">
            <MetricRow label="Category"       value={product.category || sku.category || '—'} />
            <MetricRow label="Unit"           value={product.unit || sku.unit || '—'} />
            <MetricRow label="Perishable"     value={sku.is_perishable ? 'Yes' : 'No'} />
            <MetricRow label="Shelf Life"     value={sku.shelf_life_days ? `${sku.shelf_life_days} days` : '—'} />
            <MetricRow label="Lead Time"      value={product.lead_time_days != null ? `${product.lead_time_days} days` : '—'} />
          </CardContent>
        </Card>
      </div>

      {/* ── Forecast chart ── */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>30-Day Demand Forecast</CardTitle>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Daily predicted demand with ±15% confidence band
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {forecastLoading ? (
            <SkeletonChart height={240} />
          ) : forecastChart.length === 0 ? (
            <div className="h-60 flex flex-col items-center justify-center gap-2">
              <Clock className="h-8 w-8" style={{ color: 'var(--text-muted)' }} />
              <p className="text-[13px] font-medium" style={{ color: 'var(--text-muted)' }}>
                No forecast data — train AI models first
              </p>
              <Link to="/models"
                className="text-[12px] font-semibold px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(139,92,246,.1)', color: '#8B5CF6' }}>
                Go to AI Models →
              </Link>
            </div>
          ) : (
            <AreaChart
              data={forecastChart}
              areas={[
                { key: 'upper_bound', label: 'Upper Bound', color: '#C4B5FD' },
                { key: 'forecast',    label: 'Forecast',    color: '#8B5CF6' },
                { key: 'lower_bound', label: 'Lower Bound', color: '#DDD6FE' },
              ]}
              xKey="date"
              height={240}
              formatXAxis={v => formatDate(v, 'MMM d')}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
