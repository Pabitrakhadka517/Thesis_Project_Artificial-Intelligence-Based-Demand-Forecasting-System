import { cn } from '@/utils'
import { STOCK_STATUS_STYLES, ALERT_PRIORITY_STYLES } from '@/constants/statusColors'

const BADGE_STYLES = {
  default:  { background: 'var(--surface-muted)', color: 'var(--text-secondary)', border: '1px solid var(--border)' },
  primary:  { background: 'var(--tint-primary)',   color: 'var(--brand-blue)',  border: '1px solid var(--tint-primary-border)' },
  success:  { background: 'var(--tint-success)',   color: 'var(--color-success)', border: '1px solid var(--tint-success-border)' },
  warning:  { background: 'var(--tint-warning)',   color: 'var(--brand-amber)', border: '1px solid var(--tint-warning-border)' },
  danger:   { background: 'var(--tint-danger)',    color: 'var(--color-danger)', border: '1px solid var(--tint-danger-border)' },
  info:     { background: 'var(--tint-info)',      color: 'var(--color-info)',  border: '1px solid var(--tint-info-border)' },
  purple:   { background: 'var(--tint-purple)',    color: 'var(--brand-purple)', border: '1px solid var(--tint-purple-border)' },
  ai:       { background: 'var(--tint-purple)',    color: 'var(--brand-purple)', border: '1px solid var(--tint-purple-border)' },
}

export function Badge({ children, className, variant = 'default', dot = false, style: extraStyle, ...props }) {
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
        ...extraStyle,
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

// Both badges below render directly from the canonical maps in
// constants/statusColors.js (not the generic BADGE_STYLES variants above) so
// the full 5-/4-way color distinction survives — e.g. "Out of Stock" reads as
// a visibly more severe red than "Critical", and "High" alert priority stays
// distinct from "Critical" instead of collapsing onto the same danger color.

export function StockStatusBadge({ status }) {
  const m = STOCK_STATUS_STYLES[status] || STOCK_STATUS_STYLES.healthy
  return (
    <Badge style={{ background: m.tint, color: m.color, border: `1px solid ${m.tintBorder}` }} dot>
      {m.label}
    </Badge>
  )
}

export function AlertPriorityBadge({ priority }) {
  const m = ALERT_PRIORITY_STYLES[priority] || ALERT_PRIORITY_STYLES.medium
  return (
    <Badge style={{ background: m.tint, color: m.color, border: `1px solid ${m.tintBorder}` }} dot>
      {m.label}
    </Badge>
  )
}
