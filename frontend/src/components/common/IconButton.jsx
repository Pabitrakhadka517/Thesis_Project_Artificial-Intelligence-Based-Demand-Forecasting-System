import { cn } from '@/utils'

const VARIANTS = {
  default: { color: 'var(--text-muted)' },
  danger:  { color: 'var(--color-danger)' },
  primary: { color: 'var(--brand-blue)' },
}

/**
 * Icon-only action button (table row actions, panel close buttons, etc).
 * `label` is required and renders as aria-label + title so every icon-only
 * control in the app has an accessible name — the audit found this missing
 * on most list-page row actions. Hover/focus are pure CSS, no JS mouse
 * handlers, so this also replaces the repeated onMouseEnter/onMouseLeave
 * boilerplate scattered across list pages.
 */
export function IconButton({ icon: Icon, label, variant = 'default', className, size = 16, ...props }) {
  const v = VARIANTS[variant] || VARIANTS.default
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn('icon-btn inline-flex items-center justify-center shrink-0', className)}
      style={{
        width: '30px',
        height: '30px',
        borderRadius: 'var(--r-md)',
        color: v.color,
      }}
      {...props}
    >
      <Icon style={{ width: size, height: size }} />
    </button>
  )
}
