import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Activity, ArrowUpCircle, ArrowDownCircle, RefreshCw,
  ShoppingCart, ShoppingBag, Search, AlertTriangle,
} from 'lucide-react'
import axiosInstance from '@/api/axiosInstance'

const TYPE_CONFIG = {
  purchase:   { label: 'Purchase',   color: '#10B981', bg: 'rgba(16,185,129,.1)',  Icon: ArrowUpCircle,   sign: '+' },
  sale:       { label: 'Sale',       color: '#EF4444', bg: 'rgba(239,68,68,.1)',   Icon: ArrowDownCircle, sign: '-' },
  adjustment: { label: 'Adjustment', color: '#6366F1', bg: 'rgba(99,102,241,.1)',  Icon: RefreshCw,       sign: '±' },
  return:     { label: 'Return',     color: '#F59E0B', bg: 'rgba(245,158,11,.1)',  Icon: ArrowUpCircle,   sign: '+' },
  waste:      { label: 'Waste',      color: '#64748B', bg: 'rgba(100,116,139,.1)', Icon: AlertTriangle,   sign: '-' },
  transfer:   { label: 'Transfer',   color: '#06B6D4', bg: 'rgba(6,182,212,.1)',   Icon: RefreshCw,       sign: '±' },
}

export default function StockMovementsPage() {
  const [search, setSearch]   = useState('')
  const [typeFilter, setType] = useState('')
  const [page, setPage]       = useState(1)
  const LIMIT = 20

  const { data, isLoading } = useQuery({
    queryKey: ['stock-movements', page, typeFilter],
    queryFn: () => axiosInstance
      .get(`/inventory/movements?page=${page}&limit=${LIMIT}&type=${typeFilter}`)
      .then(r => r.data),
    staleTime: 30_000,
  })

  const movements  = data?.data || []
  const total      = data?.pagination?.total || 0
  const totalPages = data?.pagination?.totalPages || 1

  // Client-side search on product name (movements don't support server search)
  const filtered = search
    ? movements.filter(m =>
        (m.productName || m.product?.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (m.notes || '').toLowerCase().includes(search.toLowerCase())
      )
    : movements

  const fmt = (n) => `Rs. ${Number(n || 0).toLocaleString()}`

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold" style={{ color: 'var(--text-primary)' }}>Stock Movements</h1>
        <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
          Full audit trail of every inventory change · {total} records
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 h-9 rounded-lg flex-1 min-w-48"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input type="text" placeholder="Filter by product or note…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: 'var(--text-primary)' }} />
        </div>
        <select value={typeFilter} onChange={e => { setType(e.target.value); setPage(1) }}
          className="h-9 px-3 rounded-lg text-[13px] outline-none"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All Types</option>
          {Object.entries(TYPE_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: 'var(--surface-card)' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Activity className="h-12 w-12 mx-auto mb-3 opacity-20" style={{ color: 'var(--text-muted)' }} />
          <p className="text-[14px]" style={{ color: 'var(--text-muted)' }}>No movements found</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                {['Type', 'Product', 'Change', 'Before', 'After', 'Reference', 'Recorded By', 'Date'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, idx) => {
                const cfg = TYPE_CONFIG[m.type] || TYPE_CONFIG.adjustment
                const Icon = cfg.Icon
                const qty  = m.quantity || 0
                return (
                  <motion.tr key={m._id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }}
                    className="border-b last:border-b-0"
                    style={{ borderColor: 'var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-lg"
                        style={{ background: cfg.bg, color: cfg.color }}>
                        <Icon className="h-3.5 w-3.5" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold truncate max-w-36" style={{ color: 'var(--text-primary)' }}>
                        {m.productName || m.product?.name || '—'}
                      </p>
                      {m.product?.sku && (
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{m.product.sku}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[15px] font-bold"
                        style={{ color: qty > 0 ? '#10B981' : qty < 0 ? '#EF4444' : '#6366F1' }}>
                        {qty > 0 ? '+' : ''}{qty}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {m.stockBefore ?? '—'}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {m.stockAfter ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {m.reference ? (
                        <code className="text-[11px] px-1.5 py-0.5 rounded"
                          style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)' }}>
                          {m.reference}
                        </code>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                      {m.recordedBy?.fullName || 'System'}
                    </td>
                    <td className="px-4 py-3 text-[12px] whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                      {new Date(m.date || m.createdAt).toLocaleDateString()}{' '}
                      <span className="text-[10px]">
                        {new Date(m.date || m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            Page {page} of {totalPages} · {total} total movements
          </p>
          <div className="flex gap-1.5">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-40"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              Prev
            </button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-40"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
