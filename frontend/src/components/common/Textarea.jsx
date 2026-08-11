import { cn } from '@/utils'
import { forwardRef } from 'react'

export const Textarea = forwardRef(function Textarea(
  { className, label, error, hint, rows = 3, ...props },
  ref
) {
  const areaId  = props.id || (props.name ? `textarea-${props.name}` : undefined)
  const errorId = areaId ? `${areaId}-error` : undefined
  const hintId  = areaId ? `${areaId}-hint`  : undefined
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label
          htmlFor={areaId}
          className="block text-[12px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--text-muted)' }}
        >
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={areaId}
        rows={rows}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : (hint ? hintId : undefined)}
        className={cn(
          'w-full text-[13px] outline-none transition-all resize-y',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
        style={{
          background: 'var(--surface-input)',
          border: error ? '1.5px solid var(--brand-red)' : '1.5px solid var(--border)',
          borderRadius: 'var(--r-md)',
          padding: '9px 12px',
          color: 'var(--text-primary)',
        }}
        onFocus={e => {
          e.target.style.borderColor = error ? 'var(--brand-red)' : 'var(--brand-blue)'
          e.target.style.boxShadow = error ? 'var(--focus-ring-danger)' : 'var(--focus-ring)'
        }}
        onBlur={e => {
          e.target.style.borderColor = error ? 'var(--brand-red)' : 'var(--border)'
          e.target.style.boxShadow = 'none'
        }}
        {...props}
      />
      {error && (
        <p id={errorId} role="alert" className="text-[11px] font-medium" style={{ color: 'var(--brand-red)' }}>{error}</p>
      )}
      {hint && !error && (
        <p id={hintId} className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{hint}</p>
      )}
    </div>
  )
})
