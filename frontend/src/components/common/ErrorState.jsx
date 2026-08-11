import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from './Button'

export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  const message =
    error?.response?.data?.detail ||
    error?.message ||
    'An unexpected error occurred. Please try again.'

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-14 w-14 rounded-full flex items-center justify-center mb-4"
        style={{ background: 'rgba(239,68,68,.1)' }}>
        <AlertCircle className="h-7 w-7" style={{ color: 'var(--brand-red)' }} />
      </div>
      <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h3>
      <p className="text-sm max-w-sm mb-4" style={{ color: 'var(--text-muted)' }}>
        {message}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" icon={RefreshCw} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
