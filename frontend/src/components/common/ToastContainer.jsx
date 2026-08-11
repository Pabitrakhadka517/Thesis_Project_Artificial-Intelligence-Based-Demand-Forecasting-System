import { useSelector, useDispatch } from 'react-redux'
import { AnimatePresence, motion } from 'framer-motion'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { selectNotifications, removeNotification } from '@/store/slices/uiSlice'
import { MOTION } from '@/constants'

const ICON_COLOR = {
  success: 'var(--color-success)',
  error:   'var(--color-danger)',
  warning: 'var(--color-warning)',
  default: 'var(--brand-blue)',
}

const ICONS = {
  success: CheckCircle,
  error:   AlertCircle,
  warning: AlertTriangle,
  default: Info,
}

export function ToastContainer() {
  const dispatch = useDispatch()
  const notifications = useSelector(selectNotifications)

  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
    >
      <AnimatePresence>
        {notifications.map((n) => {
          const Icon = ICONS[n.variant] || ICONS.default
          const iconColor = ICON_COLOR[n.variant] || ICON_COLOR.default
          return (
            <motion.div
              key={n.id}
              role={n.variant === 'error' ? 'alert' : 'status'}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: MOTION.base, ease: MOTION.ease }}
              className="pointer-events-auto flex items-start gap-3 p-4"
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-lg)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              <Icon className="h-5 w-5 shrink-0 mt-0.5" style={{ color: iconColor }} />
              <div className="flex-1 min-w-0">
                {n.title && (
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {n.title}
                  </p>
                )}
                {n.description && (
                  <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {n.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => dispatch(removeNotification(n.id))}
                aria-label="Dismiss notification"
                className="shrink-0 rounded-md p-0.5"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
