import { cn } from '@/utils'
import { forwardRef } from 'react'

export const Input = forwardRef(function Input(
  { className, label, error, icon: Icon, hint, rightElement, ...props },
  ref
) {
  const inputId = props.id || (props.name ? `input-${props.name}` : undefined)
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-[12px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--text-muted)' }}
        >
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-muted)' }}
          >
            <Icon style={{ width: '14px', height: '14px' }} />
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full text-[13px] outline-none transition-all',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
          style={{
            background: 'var(--surface-input)',
            border: error
              ? '1.5px solid #EF4444'
              : '1.5px solid var(--border)',
            borderRadius: '8px',
            padding: `9px ${rightElement ? '34px' : '12px'} 9px ${Icon ? '34px' : '12px'}`,
            color: 'var(--text-primary)',
          }}
          onFocus={e => {
            if (!error) {
              e.target.style.borderColor = '#2563EB'
              e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,.12)'
            }
          }}
          onBlur={e => {
            if (!error) {
              e.target.style.borderColor = 'var(--border)'
              e.target.style.boxShadow = 'none'
            }
          }}
          {...props}
        />
        {rightElement && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            {rightElement}
          </span>
        )}
      </div>
      {error && (
        <p className="text-[11px] font-medium" style={{ color: '#EF4444' }}>{error}</p>
      )}
      {hint && !error && (
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{hint}</p>
      )}
    </div>
  )
})
