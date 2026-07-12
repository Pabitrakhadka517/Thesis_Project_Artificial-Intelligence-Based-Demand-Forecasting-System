import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Warehouse, Search, ArrowUpCircle, ArrowDownCircle, RefreshCw,
  AlertTriangle, CheckCircle, XCircle, TrendingDown, X, Activity,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import axiosInstance from '@/api/axiosInstance'
import { getProductImage, imgFallback, formatRs, STOCK_STATUS } from '@/utils'
import { useToast } from '@/hooks/useToast'
import { useRole } from '@/hooks/useRole'
import { ErrorState } from '@/components/common/ErrorState'
import { Pagination } from '@/components/common/Pagination'
import { useSortable } from '@/hooks/useSortable'
import { SortableTH } from '@/components/common/SortableTH'

const adjustSchema = z.object({
  type:     z.enum(['addition','deduction','adjustment']),
  quantity: z.coerce.number().min(1, 'Quantity must be at least 1'),
  reason:   z.string().min(3, 'Reason required'),
  notes:    z.string().optional(),
})

const STATUS_ICON = { out_of_stock: XCircle, critical: AlertTriangle, healthy: CheckCircle, overstock: TrendingDown }
const STATUS_CONFIG = Object.fromEntries(
  Object.entries(STOCK_STATUS).map(([k, v]) => [k, { ...v, Icon: STATUS_ICON[k] || CheckCircle }])
)

function StockBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.healthy
  const { Icon } = cfg
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}>
      <Icon className="h-3 w-3" />{cfg.label}
    </span>
  )
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5"
        style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
      {error && <p className="text-[11px] mt-1" style={{ color: 'var(--error)' }}>{error}</p>}
    </div>
  )
}

function AdjustModal({ product, onClose }) {
  const qc = useQueryClient()
  const { toast } = useToast()

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(adjustSchema),
    defaultValues: { type: 'addition', quantity: 1, reason: '' },
  })
  const type = watch('type')

  const mutation = useMutation({
    mutationFn: (d) => axiosInstance.post(`/inventory/${product._id}/adjust`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      toast({ title: 'Stock adjusted successfully', variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: e.response?.data?.message || 'Adjustment failed', variant: 'error' }),
  })

  const TYPE_OPTIONS = [
    { value: 'addition',   label: 'Add Stock',   icon: ArrowUpCircle,   color: '#10B981' },
    { value: 'deduction',  label: 'Remove Stock', icon: ArrowDownCircle, color: '#EF4444' },
    { value: 'adjustment', label: 'Set Exact',    icon: RefreshCw,       color: '#6366F1' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: .95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: .95, y: 12 }}
        className="w-full max-w-md rounded-2xl p-6"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>Adjust Stock</h3>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{product.name}</p>
          </div>
          <button onClick={onClose}
            className="h-7 w-7 rounded-md flex items-center justify-center"
            style={{ color: 'var(--text-muted)', background: 'var(--surface-muted)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Current stock info */}
        <div className="flex gap-3 mb-5">
          {[
            { label: 'Current Stock', value: `${product.currentStock} ${product.unit}` },
            { label: 'Reorder At',    value: product.reorderLevel },
            { label: 'Max Stock',     value: product.maxStock },
          ].map(item => (
            <div key={item.label} className="flex-1 text-center p-2.5 rounded-xl"
              style={{ background: 'var(--surface-muted)' }}>
              <p className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>{item.value}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{item.label}</p>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit(mutation.mutate)} className="space-y-4">
          {/* Type selector */}
          <Field label="Adjustment Type">
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map(opt => {
                const Icon = opt.icon
                const selected = type === opt.value
                return (
                  <label key={opt.value}
                    className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl cursor-pointer border-2 transition-all"
                    style={{
                      borderColor: selected ? opt.color : 'var(--border)',
                      background: selected ? `${opt.color}15` : 'var(--surface-muted)',
                    }}>
                    <input type="radio" value={opt.value} {...register('type')} className="sr-only" />
                    <Icon className="h-5 w-5" style={{ color: selected ? opt.color : 'var(--text-muted)' }} />
                    <span className="text-[11px] font-semibold text-center"
                      style={{ color: selected ? opt.color : 'var(--text-muted)' }}>{opt.label}</span>
                  </label>
                )
              })}
            </div>
          </Field>

          <Field label="Quantity" error={errors.quantity?.message}>
            <input type="number" min={1}
              className="w-full px-3 py-2.5 rounded-lg text-[13px] outline-none"
              style={{ background: 'var(--surface-muted)', border: `1.5px solid ${errors.quantity ? 'var(--error)' : 'var(--border)'}`, color: 'var(--text-primary)' }}
              {...register('quantity')} />
          </Field>

          <Field label="Reason *" error={errors.reason?.message}>
            <input type="text" placeholder="e.g. Damaged goods, New shipment…"
              className="w-full px-3 py-2.5 rounded-lg text-[13px] outline-none"
              style={{ background: 'var(--surface-muted)', border: `1.5px solid ${errors.reason ? 'var(--error)' : 'var(--border)'}`, color: 'var(--text-primary)' }}
              {...register('reason')} />
          </Field>

          <Field label="Notes">
            <textarea rows={2}
              className="w-full px-3 py-2.5 rounded-lg text-[13px] outline-none resize-none"
              style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)', color: 'var(--text-primary)' }}
              {...register('notes')} />
          </Field>

          <button type="submit" disabled={mutation.isPending}
            className="w-full py-2.5 rounded-xl text-[14px] font-bold text-white"
            style={{ background: 'var(--brand-primary)', opacity: mutation.isPending ? .7 : 1 }}>
            {mutation.isPending ? 'Saving…' : 'Apply Adjustment'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  )
}

function MovementsModal({ product, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['movements', product._id],
    queryFn: () => axiosInstance.get(`/inventory/movements?product=${product._id}&limit=20`).then(r => r.data),
  })

  const movements = data?.data || []

  const TYPE_STYLE = {
    sale:       { color: '#EF4444', label: 'Sale',       Icon: ArrowDownCircle },
    purchase:   { color: '#10B981', label: 'Purchase',   Icon: ArrowUpCircle },
    addition:   { color: '#10B981', label: 'Addition',   Icon: ArrowUpCircle },
    deduction:  { color: '#EF4444', label: 'Deduction',  Icon: ArrowDownCircle },
    adjustment: { color: '#6366F1', label: 'Adjustment', Icon: RefreshCw },
    return:     { color: '#F59E0B', label: 'Return',     Icon: RefreshCw },
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: .95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: .95, y: 12 }}
        className="w-full max-w-lg rounded-2xl p-6 max-h-[80vh] flex flex-col"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>Stock History</h3>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{product.name}</p>
          </div>
          <button onClick={onClose}
            className="h-7 w-7 rounded-md flex items-center justify-center"
            style={{ color: 'var(--text-muted)', background: 'var(--surface-muted)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 space-y-2">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: 'var(--surface-muted)' }} />
            ))
          ) : movements.length === 0 ? (
            <p className="text-center py-8 text-[13px]" style={{ color: 'var(--text-muted)' }}>No movements recorded</p>
          ) : movements.map((m) => {
            const cfg = TYPE_STYLE[m.type] || TYPE_STYLE.adjustment
            const Icon = cfg.Icon
            return (
              <div key={m._id} className="flex items-center gap-3 p-3 rounded-lg"
                style={{ background: 'var(--surface-muted)' }}>
                <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${cfg.color}15` }}>
                  <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
                    {m.reason && <span className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{m.reason}</span>}
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {new Date(m.createdAt).toLocaleDateString()} · {m.createdBy?.fullName || 'System'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[13px] font-bold"
                    style={{ color: m.quantity > 0 ? '#10B981' : '#EF4444' }}>
                    {m.quantity > 0 ? '+' : ''}{m.quantity}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>→ {m.balanceAfter}</p>
                </div>
              </div>
            )
          })}
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function InventoryPage() {
  const { can } = useRole()
  const [search, setSearch]       = useState('')
  const [stockFilter, setStock]   = useState('')
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState(20)
  const [adjusting, setAdjust]    = useState(null)
  const [viewingMov, setViewMov]  = useState(null)
  const sort = useSortable('createdAt', 'desc')

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['inventory', page, pageSize, search, stockFilter, sort.sortBy, sort.sortDir],
    queryFn: () => axiosInstance
      .get(`/products?page=${page}&limit=${pageSize}&search=${encodeURIComponent(search)}&stockStatus=${stockFilter}&sortBy=${sort.sortBy}&sortDir=${sort.sortDir}`)
      .then(r => r.data),
    staleTime: 30_000,
  })

  const onSort = (key) => { sort.toggle(key); setPage(1) }
  const products   = data?.data || []
  const total      = data?.pagination?.total || 0

  const formatPrice = (n) => formatRs(n, { abbreviate: false })

  const summaryStats = {
    total,
    outOfStock: products.filter(p => p.stockStatus === 'out_of_stock').length,
    critical:   products.filter(p => p.stockStatus === 'critical').length,
    overstock:  products.filter(p => p.stockStatus === 'overstock').length,
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold" style={{ color: 'var(--text-primary)' }}>Inventory</h1>
        <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
          Monitor stock levels and adjust quantities
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total SKUs',    value: summaryStats.total,      color: '#3B82F6', bg: 'rgba(59,130,246,.1)' },
          { label: 'Out of Stock',  value: summaryStats.outOfStock, color: '#EF4444', bg: 'rgba(239,68,68,.1)' },
          { label: 'Critical',      value: summaryStats.critical,   color: '#F59E0B', bg: 'rgba(245,158,11,.1)' },
          { label: 'Overstock',     value: summaryStats.overstock,  color: '#6366F1', bg: 'rgba(99,102,241,.1)' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl p-4"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
            <div className="h-8 w-8 rounded-lg mb-2 flex items-center justify-center"
              style={{ background: stat.bg }}>
              <Warehouse className="h-4 w-4" style={{ color: stat.color }} />
            </div>
            <p className="text-[22px] font-bold" style={{ color: 'var(--text-primary)' }}>{stat.value}</p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 h-9 rounded-lg flex-1 min-w-48"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input type="text" placeholder="Search products…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: 'var(--text-primary)' }} />
        </div>
        <select value={stockFilter} onChange={e => { setStock(e.target.value); setPage(1) }}
          className="h-9 px-3 rounded-lg text-[13px] outline-none"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All Status</option>
          <option value="out_of_stock">Out of Stock</option>
          <option value="critical">Critical</option>
          <option value="healthy">Healthy</option>
          <option value="overstock">Overstock</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: 'var(--surface-card)' }} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : products.length === 0 ? (
        <div className="text-center py-16">
          <Warehouse className="h-12 w-12 mx-auto mb-3 opacity-20" style={{ color: 'var(--text-muted)' }} />
          <p className="text-[14px]" style={{ color: 'var(--text-muted)' }}>No products found</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-x-auto"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                <SortableTH label="Product" sortKey="name" sortBy={sort.sortBy} sortDir={sort.sortDir} onSort={onSort} />
                <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Category</th>
                <SortableTH label="Current Stock" sortKey="currentStock" sortBy={sort.sortBy} sortDir={sort.sortDir} onSort={onSort} />
                <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Min / Max</th>
                <SortableTH label="Stock Value" sortKey="stockValue" sortBy={sort.sortBy} sortDir={sort.sortDir} onSort={onSort} />
                <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Status</th>
                <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p._id}
                  className="border-b last:border-b-0"
                  style={{ borderColor: 'var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg overflow-hidden shrink-0"
                        style={{ background: 'var(--surface-muted)' }}>
                        <img src={getProductImage(p)} alt={p.name}
                          className="h-8 w-8 object-cover" onError={imgFallback} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate max-w-36" style={{ color: 'var(--text-primary)' }}>{p.name}</p>
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{p.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                    {p.category?.name || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>
                      {p.currentStock}
                    </span>
                    <span className="text-[11px] ml-1" style={{ color: 'var(--text-muted)' }}>{p.unit}</span>
                  </td>
                  <td className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                    {p.reorderLevel} / {p.maxStock}
                  </td>
                  <td className="px-4 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {formatPrice((p.currentStock || 0) * (p.buyingPrice || 0))}
                  </td>
                  <td className="px-4 py-3">
                    <StockBadge status={p.stockStatus || 'healthy'} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setViewMov(p)}
                        title="View history"
                        className="h-7 w-7 rounded-md flex items-center justify-center"
                        style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <Activity className="h-3.5 w-3.5" />
                      </button>
                      {can('inventory_manager') && (
                        <button
                          onClick={() => setAdjust(p)}
                          title="Adjust stock"
                          className="h-7 px-2 rounded-md flex items-center gap-1 text-[11px] font-semibold"
                          style={{ background: 'rgba(37,99,235,.1)', color: '#3B82F6' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(37,99,235,.2)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(37,99,235,.1)'}>
                          <RefreshCw className="h-3 w-3" /> Adjust
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

      {/* Modals */}
      <AnimatePresence>
        {adjusting && <AdjustModal product={adjusting} onClose={() => setAdjust(null)} />}
        {viewingMov && <MovementsModal product={viewingMov} onClose={() => setViewMov(null)} />}
      </AnimatePresence>
    </div>
  )
}
