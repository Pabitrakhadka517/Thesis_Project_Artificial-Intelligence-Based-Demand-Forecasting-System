import { InboxIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/utils'

export function EmptyState({
  icon: Icon = InboxIcon,
  title = 'No data found',
  description,
  action,
  className,
  iconColor = '#94A3B8',
  iconBg,
}) {
  const bg = iconBg || 'var(--surface-muted)'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn('flex flex-col items-center justify-center py-16 text-center px-6', className)}
    >
      <div
        className="h-16 w-16 rounded-2xl flex items-center justify-center mb-5"
        style={{
          background: bg,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <Icon style={{ width: '28px', height: '28px', color: iconColor }} />
      </div>

      <h3
        className="text-[15px] font-semibold mb-1.5"
        style={{ color: 'var(--text-primary)' }}
      >
        {title}
      </h3>

      {description && (
        <p
          className="text-[13px] max-w-xs leading-relaxed"
          style={{ color: 'var(--text-muted)' }}
        >
          {description}
        </p>
      )}

      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  )
}
