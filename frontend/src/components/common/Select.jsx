import { cn } from '@/utils'
import { forwardRef } from 'react'

export const Select = forwardRef(function Select(
  { className, label, error, options = [], placeholder, ...props },
  ref
) {
  const selectId = props.id || (props.name ? `select-${props.name}` : undefined)
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-[12px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--text-muted)' }}
        >
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className="w-full text-[13px] outline-none transition-all appearance-none cursor-pointer"
        style={{
          background: `var(--surface-input) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center`,
          border: error ? '1.5px solid #EF4444' : '1.5px solid var(--border)',
          borderRadius: '8px',
          padding: '9px 32px 9px 12px',
          color: 'var(--text-primary)',
        }}
        onFocus={e => {
          e.target.style.borderColor = '#2563EB'
          e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,.12)'
        }}
        onBlur={e => {
          e.target.style.borderColor = error ? '#EF4444' : 'var(--border)'
          e.target.style.boxShadow = 'none'
        }}
        {...props}
      >
        {placeholder && (
          <option value="">{placeholder}</option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-[11px] font-medium" style={{ color: '#EF4444' }}>{error}</p>
      )}
    </div>
  )
})
