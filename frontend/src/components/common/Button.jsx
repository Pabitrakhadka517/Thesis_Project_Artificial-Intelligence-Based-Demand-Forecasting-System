import { cn } from '@/utils'
import { Loader2 } from 'lucide-react'

const VARIANTS = {
  primary: {
    background: '#03045e',
    color: '#fff',
    border: 'none',
    boxShadow: '0 2px 8px rgba(3,4,94,.4)',
    hover: { boxShadow: '0 4px 14px rgba(3,4,94,.5)', transform: 'translateY(-1px)' },
  },
  secondary: {
    background: 'var(--surface-muted)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
    boxShadow: 'none',
  },
  danger: {
    background: 'linear-gradient(135deg,#B91C1C,#EF4444)',
    color: '#fff',
    border: 'none',
    boxShadow: '0 2px 8px rgba(239,68,68,.3)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: 'none',
    boxShadow: 'none',
  },
  outline: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
    boxShadow: 'none',
  },
  success: {
    background: 'linear-gradient(135deg,#15803D,#22C55E)',
    color: '#fff',
    border: 'none',
    boxShadow: '0 2px 8px rgba(34,197,94,.3)',
  },
  ai: {
    background: 'linear-gradient(135deg,#6D28D9,#8B5CF6)',
    color: '#fff',
    border: 'none',
    boxShadow: '0 2px 8px rgba(139,92,246,.35)',
  },
}

const SIZES = {
  xs: { padding: '4px 10px', fontSize: '11px', borderRadius: '6px', gap: '4px' },
  sm: { padding: '6px 12px', fontSize: '12px', borderRadius: '7px', gap: '5px' },
  md: { padding: '8px 16px', fontSize: '13px', borderRadius: '8px', gap: '6px' },
  lg: { padding: '11px 22px', fontSize: '14px', borderRadius: '9px', gap: '7px' },
}

export function Button({
  children,
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  style: extraStyle,
  ...props
}) {
  const v = VARIANTS[variant] || VARIANTS.primary
  const s = SIZES[size] || SIZES.md

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-all duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        className
      )}
      style={{
        ...v,
        padding: s.padding,
        fontSize: s.fontSize,
        borderRadius: s.borderRadius,
        gap: s.gap,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        ...extraStyle,
      }}
      disabled={disabled || loading}
      onMouseEnter={e => {
        if (!disabled && !loading && v.hover) {
          Object.assign(e.currentTarget.style, v.hover)
        } else if (!disabled && !loading && variant === 'secondary') {
          e.currentTarget.style.background = 'var(--border)'
        } else if (!disabled && !loading && variant === 'outline') {
          e.currentTarget.style.background = 'var(--surface-muted)'
        } else if (!disabled && !loading && variant === 'ghost') {
          e.currentTarget.style.background = 'var(--surface-muted)'
        }
      }}
      onMouseLeave={e => {
        if (!disabled && !loading) {
          e.currentTarget.style.boxShadow = v.boxShadow || 'none'
          e.currentTarget.style.transform = 'none'
          e.currentTarget.style.background = v.background || 'transparent'
        }
      }}
      {...props}
    >
      {loading ? (
        <Loader2 className="animate-spin" style={{ width: '14px', height: '14px' }} />
      ) : Icon ? (
        <Icon style={{ width: '14px', height: '14px', flexShrink: 0 }} />
      ) : null}
      {children}
    </button>
  )
}
