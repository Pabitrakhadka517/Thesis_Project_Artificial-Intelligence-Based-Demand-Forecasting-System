import { cn } from '@/utils'

/**
 * Canonical page header: icon? + eyebrow? + title + subtitle + right-aligned
 * actions. Every page should use this instead of hand-rolling its own title
 * row, so <h1> size/weight/spacing stays identical across the whole app.
 */
export function PageHeader({ icon: Icon, eyebrow, title, subtitle, actions, className, ...props }) {
  return (
    <div
      className={cn('flex flex-wrap items-start justify-between gap-4', className)}
      {...props}
    >
      <div className="min-w-0">
        {(eyebrow || Icon) && (
          <div className="flex items-center gap-2 mb-1.5">
            {Icon && (
              <div
                className="flex items-center justify-center shrink-0"
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--tint-primary)',
                }}
              >
                <Icon style={{ width: '15px', height: '15px', color: 'var(--brand-blue)' }} />
              </div>
            )}
            {eyebrow && <span className="section-label">{eyebrow}</span>}
          </div>
        )}
        <h1 className="truncate text-[22px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {subtitle}
          </p>
        )}
      </div>

      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
