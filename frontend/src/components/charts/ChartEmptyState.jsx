import { BarChart3 } from 'lucide-react'

/**
 * Default "nothing to show" placeholder for the shared chart wrappers.
 * Renders at the chart's own height so the surrounding card doesn't jump
 * when data arrives — a blank Recharts canvas (axes with no series) reads
 * as broken, not "no data yet".
 */
export function ChartEmptyState({ height = 300, message = 'No data for this period' }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2"
      style={{ height }}
    >
      <BarChart3 style={{ width: 22, height: 22, color: 'var(--text-muted)', opacity: 0.5 }} />
      <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{message}</p>
    </div>
  )
}
