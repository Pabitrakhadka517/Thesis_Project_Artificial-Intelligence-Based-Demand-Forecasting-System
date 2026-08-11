import { Loader2 } from 'lucide-react'

export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <Loader2
        className="animate-spin"
        style={{ width: '28px', height: '28px', color: 'var(--brand-blue)' }}
      />
    </div>
  )
}
