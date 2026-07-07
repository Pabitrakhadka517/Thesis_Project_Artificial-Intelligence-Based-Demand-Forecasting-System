import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, AlertTriangle, Package, TrendingDown, RefreshCw,
  CheckCircle, Eye, Trash2, BellOff, Zap,
} from 'lucide-react'
import axiosInstance from '@/api/axiosInstance'
import { useToast } from '@/hooks/useToast'
import { useRole } from '@/hooks/useRole'

const TYPE_CONFIG = {
  low_stock:     { label: 'Low Stock',     color: '#F59E0B', bg: 'rgba(245,158,11,.1)', Icon: Package },
  out_of_stock:  { label: 'Out of Stock',  color: '#EF4444', bg: 'rgba(239,68,68,.1)',  Icon: TrendingDown },
  overstock:     { label: 'Overstock',     color: '#6366F1', bg: 'rgba(99,102,241,.1)', Icon: TrendingDown },
  reorder_point: { label: 'Reorder Point', color: '#3B82F6', bg: 'rgba(59,130,246,.1)', Icon: RefreshCw },
  expiry:        { label: 'Expiry',        color: '#EC4899', bg: 'rgba(236,72,153,.1)', Icon: AlertTriangle },
  system:        { label: 'System',        color: '#64748B', bg: 'rgba(100,116,139,.1)', Icon: Bell },
}

const SEVERITY_CONFIG = {
  critical: { label: 'Critical', color: '#EF4444' },
  high:     { label: 'High',     color: '#F59E0B' },
  medium:   { label: 'Medium',   color: '#6366F1' },
  low:      { label: 'Low',      color: '#10B981' },
}

function AlertCard({ alert, onAcknowledge, onRead, onDelete }) {
  const typeCfg  = TYPE_CONFIG[alert.type]     || TYPE_CONFIG.system
  const sevCfg   = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.medium
  const { Icon } = typeCfg

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="rounded-xl p-4"
      style={{
        background: 'var(--surface-card)',
        border: `1px solid ${alert.isRead ? 'var(--border)' : typeCfg.color + '40'}`,
        opacity: alert.status === 'resolved' ? 0.6 : 1,
      }}>
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: typeCfg.bg }}>
          <Icon className="h-4.5 w-4.5" style={{ color: typeCfg.color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: typeCfg.bg, color: typeCfg.color }}>
              {typeCfg.label}
            </span>
            <span className="text-[10px] font-semibold"
              style={{ color: sevCfg.color }}>
              {sevCfg.label}
            </span>
            {!alert.isRead && (
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: '#3B82F6' }} />
            )}
            {alert.status === 'acknowledged' && (
              <span className="text-[10px] font-semibold" style={{ color: '#10B981' }}>
                Acknowledged
              </span>
            )}
          </div>

          <p className="text-[14px] font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>
            {alert.title}
          </p>
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            {alert.message}
          </p>
          {alert.product && (
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
              Product: {alert.product?.name || alert.product}
            </p>
          )}
          <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
            {new Date(alert.createdAt).toLocaleString()}
          </p>
        </div>

        <div className="flex gap-1.5 shrink-0">
          {!alert.isRead && (
            <button onClick={() => onRead(alert._id)} title="Mark read"
              className="h-7 w-7 rounded-md flex items-center justify-center"
              style={{ color: '#3B82F6', background: 'rgba(59,130,246,.1)' }}>
              <Eye className="h-3.5 w-3.5" />
            </button>
          )}
          {alert.status === 'active' && (
            <button onClick={() => onAcknowledge(alert._id)} title="Acknowledge"
              className="h-7 w-7 rounded-md flex items-center justify-center"
              style={{ color: '#10B981', background: 'rgba(16,185,129,.1)' }}>
              <CheckCircle className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={() => onDelete(alert._id)} title="Delete"
            className="h-7 w-7 rounded-md flex items-center justify-center"
            style={{ color: '#EF4444' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

export default function AlertsPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { can } = useRole()

  const [typeFilter, setType]     = useState('')
  const [statusFilter, setStatus] = useState('')
  const [page, setPage]           = useState(1)
  const LIMIT = 20

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', page, typeFilter, statusFilter],
    queryFn: () => axiosInstance
      .get(`/alerts?page=${page}&limit=${LIMIT}&type=${typeFilter}&status=${statusFilter}`)
      .then(r => r.data),
    staleTime: 15_000,
    refetchInterval: 60_000,
  })

  const alerts     = data?.data || []
  const total      = data?.pagination?.total || 0
  const totalPages = data?.pagination?.totalPages || 1
  const unread     = alerts.filter(a => !a.isRead).length

  const generateMutation = useMutation({
    mutationFn: () => axiosInstance.post('/alerts/generate'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      const count = res.data?.data?.count || 0
      toast({ title: `Generated ${count} new alerts`, variant: 'success' })
    },
    onError: (e) => toast({ title: e.response?.data?.message || 'Failed', variant: 'error' }),
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => axiosInstance.patch('/alerts/mark-all-read'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      toast({ title: 'All alerts marked as read', variant: 'success' })
    },
    onError: () => toast({ title: 'Failed to mark all read', variant: 'error' }),
  })

  const markReadMutation = useMutation({
    mutationFn: (id) => axiosInstance.patch(`/alerts/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const acknowledgeMutation = useMutation({
    mutationFn: (id) => axiosInstance.patch(`/alerts/${id}/acknowledge`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      toast({ title: 'Alert acknowledged', variant: 'success' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => axiosInstance.delete(`/alerts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
    onError: () => toast({ title: 'Failed to delete', variant: 'error' }),
  })

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold" style={{ color: 'var(--text-primary)' }}>Alerts</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {total} alerts · {unread} unread
          </p>
        </div>
        <div className="flex gap-2">
          {unread > 0 && (
            <button onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-semibold"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              <BellOff className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
          {can('inventory_manager') && (
            <button onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold text-white"
              style={{ background: '#03045e', boxShadow: '0 4px 16px rgba(3,4,94,.4)' }}>
              <Zap className="h-4 w-4" />
              {generateMutation.isPending ? 'Scanning…' : 'Scan Inventory'}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select value={typeFilter} onChange={e => { setType(e.target.value); setPage(1) }}
          className="h-9 px-3 rounded-lg text-[13px] outline-none"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All Types</option>
          {Object.entries(TYPE_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="h-9 px-3 rounded-lg text-[13px] outline-none"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {/* Alert list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: 'var(--surface-card)' }} />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="h-12 w-12 mx-auto mb-3 opacity-20" style={{ color: 'var(--text-muted)' }} />
          <p className="text-[14px]" style={{ color: 'var(--text-muted)' }}>No alerts found</p>
          {can('inventory_manager') && (
            <button onClick={() => generateMutation.mutate()}
              className="mt-4 px-4 py-2 rounded-xl text-[13px] font-semibold"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              Run inventory scan
            </button>
          )}
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="space-y-3">
            {alerts.map((alert) => (
              <AlertCard
                key={alert._id}
                alert={alert}
                onRead={markReadMutation.mutate}
                onAcknowledge={acknowledgeMutation.mutate}
                onDelete={deleteMutation.mutate}
              />
            ))}
          </div>
        </AnimatePresence>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Page {page} of {totalPages}</p>
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
