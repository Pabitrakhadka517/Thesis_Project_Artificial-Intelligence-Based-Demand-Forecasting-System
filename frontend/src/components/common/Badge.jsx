import { cn } from '@/utils'

const BADGE_STYLES = {
  default:  { background: 'var(--surface-muted)', color: 'var(--text-secondary)', border: '1px solid var(--border)' },
  primary:  { background: 'rgba(37,99,235,.1)',    color: '#2563EB', border: '1px solid rgba(37,99,235,.2)' },
  success:  { background: 'rgba(34,197,94,.1)',    color: '#16A34A', border: '1px solid rgba(34,197,94,.2)' },
  warning:  { background: 'rgba(245,158,11,.1)',   color: '#B45309', border: '1px solid rgba(245,158,11,.2)' },
  danger:   { background: 'rgba(239,68,68,.1)',    color: '#DC2626', border: '1px solid rgba(239,68,68,.2)' },
  info:     { background: 'rgba(6,182,212,.1)',    color: '#0E7490', border: '1px solid rgba(6,182,212,.2)' },
  purple:   { background: 'rgba(139,92,246,.1)',   color: '#7C3AED', border: '1px solid rgba(139,92,246,.2)' },
  ai:       { background: 'linear-gradient(135deg,rgba(109,40,217,.12),rgba(139,92,246,.12))', color: '#7C3AED', border: '1px solid rgba(139,92,246,.25)' },
}

const DARK_BADGE_STYLES = {
  default:  { background: 'rgba(30,41,59,.8)',   color: '#94A3B8' },
  primary:  { background: 'rgba(37,99,235,.15)',  color: '#60A5FA' },
  success:  { background: 'rgba(34,197,94,.15)',  color: '#4ADE80' },
  warning:  { background: 'rgba(245,158,11,.15)', color: '#FCD34D' },
  danger:   { background: 'rgba(239,68,68,.15)',  color: '#F87171' },
  info:     { background: 'rgba(6,182,212,.15)',  color: '#22D3EE' },
  purple:   { background: 'rgba(139,92,246,.15)', color: '#A78BFA' },
  ai:       { background: 'rgba(139,92,246,.15)', color: '#A78BFA' },
}

export function Badge({ children, className, variant = 'default', dot = false, ...props }) {
  const s = BADGE_STYLES[variant] || BADGE_STYLES.default
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full',
        className
      )}
      style={{
        ...s,
        padding: '2px 9px',
        fontSize: '11px',
        lineHeight: '18px',
        whiteSpace: 'nowrap',
      }}
      {...props}
    >
      {dot && (
        <span style={{
          width: '5px', height: '5px', borderRadius: '50%',
          background: 'currentColor', flexShrink: 0,
        }} />
      )}
      {children}
    </span>
  )
}

const STATUS_MAP = {
  healthy:      { variant: 'success',  label: 'Healthy',      dot: true },
  low:          { variant: 'warning',  label: 'Low Stock',    dot: true },
  critical:     { variant: 'danger',   label: 'Critical',     dot: true },
  overstock:    { variant: 'primary',  label: 'Overstock',    dot: true },
  out_of_stock: { variant: 'danger',   label: 'Out of Stock', dot: true },
}

const PRIORITY_MAP = {
  low:      { variant: 'info',    label: 'Low',      dot: true },
  medium:   { variant: 'warning', label: 'Medium',   dot: true },
  high:     { variant: 'danger',  label: 'High',     dot: true },
  critical: { variant: 'danger',  label: 'Critical', dot: true },
}

export function StockStatusBadge({ status }) {
  const m = STATUS_MAP[status] || STATUS_MAP.healthy
  return <Badge variant={m.variant} dot={m.dot}>{m.label}</Badge>
}

export function AlertPriorityBadge({ priority }) {
  const m = PRIORITY_MAP[priority] || PRIORITY_MAP.medium
  return <Badge variant={m.variant} dot={m.dot}>{m.label}</Badge>
}
