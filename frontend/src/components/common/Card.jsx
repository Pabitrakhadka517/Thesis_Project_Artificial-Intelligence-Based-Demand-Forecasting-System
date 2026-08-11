import { cn } from '@/utils'

export function Card({ className, children, ...props }) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-sm)',
        transition: 'box-shadow .18s ease',
        ...(props.style || {}),
      }}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...props }) {
  return (
    <div
      className={cn('flex items-center justify-between px-5 pt-5 pb-3', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...props }) {
  return (
    <h3
      className={cn('text-[14px] font-semibold leading-none tracking-tight', className)}
      style={{ color: 'var(--text-primary)' }}
      {...props}
    >
      {children}
    </h3>
  )
}

export function CardDescription({ className, children, ...props }) {
  return (
    <p
      className={cn('text-[12px] mt-0.5', className)}
      style={{ color: 'var(--text-muted)' }}
      {...props}
    >
      {children}
    </p>
  )
}

export function CardContent({ className, children, ...props }) {
  return (
    <div className={cn('px-5 pb-5', className)} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({ className, children, ...props }) {
  return (
    <div
      className={cn('px-5 pb-4 pt-3 flex items-center', className)}
      style={{ borderTop: '1px solid var(--border-subtle)' }}
      {...props}
    >
      {children}
    </div>
  )
}
