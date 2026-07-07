import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, RefreshCw, ChevronLeft, ChevronRight, Filter } from 'lucide-react'
import { adminService } from '@/services/adminService'
import { Card, CardContent } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { SkeletonTable } from '@/components/common/Skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { formatNumber } from '@/utils'

const ACTION_STYLES = {
  created: { bg: 'rgba(34,197,94,.1)',   color: '#22C55E' },
  updated: { bg: 'rgba(37,99,235,.1)',   color: '#2563EB' },
  deleted: { bg: 'rgba(239,68,68,.1)',   color: '#EF4444' },
  login:   { bg: 'rgba(139,92,246,.1)',  color: '#8B5CF6' },
  logout:  { bg: 'rgba(100,116,139,.1)', color: '#64748B' },
}

const MODULE_STYLES = {
  products:  { color: '#2563EB' },
  suppliers: { color: '#8B5CF6' },
  users:     { color: '#EF4444' },
  inventory: { color: '#22C55E' },
  sales:     { color: '#F59E0B' },
}

function ActionBadge({ action }) {
  const s = ACTION_STYLES[action] || { bg: 'rgba(100,116,139,.1)', color: '#64748B' }
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize" style={{ background: s.bg, color: s.color }}>
      {action}
    </span>
  )
}

function TimeAgo({ ts }) {
  if (!ts) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  const d = new Date(ts)
  const now = new Date()
  const diff = Math.floor((now - d) / 1000)
  let label
  if (diff < 60) label = `${diff}s ago`
  else if (diff < 3600) label = `${Math.floor(diff / 60)}m ago`
  else if (diff < 86400) label = `${Math.floor(diff / 3600)}h ago`
  else label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div>
      <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
    </div>
  )
}

export default function AuditLogsPage() {
  const [page, setPage] = useState(1)
  const [modFilter, setModFilter] = useState('')
  const [actFilter, setActFilter] = useState('')
  const SIZE = 50

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['audit-logs', page, modFilter, actFilter],
    queryFn: () => adminService.getAuditLogs({ page, limit: SIZE, resource: modFilter || undefined, action: actFilter || undefined }).then(r => r.data),
    refetchInterval: 30_000,
  })

  const items      = data?.data || []
  const total      = data?.pagination?.total || 0
  const totalPages = data?.pagination?.totalPages || 1

  if (error) return <ErrorState error={error} onRetry={refetch} />

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ClipboardList className="h-5 w-5" style={{ color: '#64748B' }} />
            <h1 className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Audit Logs</h1>
            <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(100,116,139,.1)', color: '#64748B' }}>
              {formatNumber(total)} events
            </span>
          </div>
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Complete audit trail of all system activities · Auto-refreshes every 30s</p>
        </div>
        <Button variant="outline" size="sm" icon={RefreshCw} onClick={refetch}>Refresh</Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap gap-3 items-center">
            <Filter className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
            <select value={modFilter} onChange={e => { setModFilter(e.target.value); setPage(1) }}
              className="text-[13px] px-3 py-2 rounded-lg outline-none"
              style={{ background: 'var(--surface-input)', border: '1.5px solid var(--border)', color: 'var(--text-primary)' }}>
              <option value="">All Resources</option>
              {['User', 'Product', 'Sale', 'Purchase', 'Supplier', 'Category', 'Inventory'].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <select value={actFilter} onChange={e => { setActFilter(e.target.value); setPage(1) }}
              className="text-[13px] px-3 py-2 rounded-lg outline-none"
              style={{ background: 'var(--surface-input)', border: '1.5px solid var(--border)', color: 'var(--text-primary)' }}>
              <option value="">All Actions</option>
              <option value="created">Created</option>
              <option value="updated">Updated</option>
              <option value="deleted">Deleted</option>
              <option value="login">Login</option>
            </select>
            {(modFilter || actFilter) && (
              <button onClick={() => { setModFilter(''); setActFilter(''); setPage(1) }}
                className="text-[12px] font-medium px-2 py-1 rounded"
                style={{ color: '#2563EB' }}>
                Clear filters
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Log Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-5"><SkeletonTable rows={10} cols={5} /></div>
          ) : items.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No audit events yet"
              description="System actions will appear here as users interact with the platform." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-enterprise">
                <thead>
                  <tr>
                    {['User', 'Action', 'Module', 'Detail', 'Timestamp'].map(h => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {items.map((log, i) => {
                    const resource = log.resource?.toLowerCase() || ''
                    const modStyle = MODULE_STYLES[resource] || { color: 'var(--text-muted)' }
                    const actionKey = log.action?.toLowerCase().replace('user_', '') || ''
                    return (
                      <tr key={log._id || i}>
                        <td>
                          <div>
                            <p className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                              {log.user?.fullName || log.userEmail || 'System'}
                            </p>
                            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{log.userEmail || '—'}</p>
                          </div>
                        </td>
                        <td><ActionBadge action={actionKey} /></td>
                        <td>
                          <span className="text-[12px] font-semibold capitalize" style={{ color: modStyle.color }}>
                            {log.resource || '—'}
                          </span>
                        </td>
                        <td>
                          <p className="text-[12px] max-w-70 truncate" style={{ color: 'var(--text-secondary)' }}>
                            {typeof log.details === 'string' ? log.details : JSON.stringify(log.details) || '—'}
                          </p>
                        </td>
                        <td><TimeAgo ts={log.createdAt} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Page {page} of {totalPages} · {formatNumber(total)} events</p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="h-7 w-7 rounded-lg flex items-center justify-center disabled:opacity-40"
                  style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
                  <ChevronLeft style={{ width: 14, height: 14 }} />
                </button>
                <span className="px-3 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="h-7 w-7 rounded-lg flex items-center justify-center disabled:opacity-40"
                  style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
                  <ChevronRight style={{ width: 14, height: 14 }} />
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
