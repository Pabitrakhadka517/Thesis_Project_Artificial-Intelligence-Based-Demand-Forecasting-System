import { useState, useEffect, useRef, memo } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn, formatNumber } from '@/utils'

const ACCENT = {
  blue:   { solid: '#2563EB' },
  green:  { solid: '#16A34A' },
  purple: { solid: '#7C3AED' },
  amber:  { solid: '#B45309' },
  red:    { solid: '#DC2626' },
  cyan:   { solid: '#0E7490' },
  indigo: { solid: '#4338CA' },
  teal:   { solid: '#0F766E' },
  orange: { solid: '#C2410C' },
}

function useCountUp(end, duration = 1000) {
  const [count, setCount] = useState(null)
  const prevRef = useRef(null)
  const rafRef  = useRef(null)

  useEffect(() => {
    if (end == null || isNaN(Number(end))) {
      setCount(end)
      return
    }
    const endNum = Number(end)
    if (prevRef.current === endNum) return
    const startNum = prevRef.current ?? 0
    const startTime = Date.now()

    const tick = () => {
      const elapsed = Date.now() - startTime
      const t = Math.min(elapsed / duration, 1)
      const ease = 1 - Math.pow(1 - t, 3)
      setCount(Math.round(startNum + (endNum - startNum) * ease))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        prevRef.current = endNum
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [end, duration])

  return count ?? end
}

function Skeleton() {
  return (
    <div
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        padding: '20px',
        paddingTop: '24px',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-0.75 skeleton rounded-none" />
      <div className="flex items-start justify-between mb-4 mt-1">
        <div className="space-y-2.5">
          <div className="skeleton h-2.5 w-20 rounded" />
          <div className="skeleton h-8 w-16 rounded" />
        </div>
        <div className="skeleton h-11 w-11 rounded-xl" />
      </div>
      <div className="skeleton h-2.5 w-24 rounded" />
    </div>
  )
}

export const KPICard = memo(function KPICard({
  title,
  value,
  unit,
  change,
  changeLabel,
  icon: Icon,
  color = 'blue',
  loading = false,
  className,
  format,
  subtitle,
  invert = false, // set true for "lower is better" KPIs (e.g. stockouts, costs) so an increase reads as bad, not good
}) {
  const isNumeric = value != null && !isNaN(Number(value))
  const animated  = useCountUp(isNumeric ? Number(value) : null)

  if (loading) return <Skeleton />

  const accent    = ACCENT[color] || ACCENT.blue
  const direction = change == null ? null : change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
  // "trend" here means good/bad, not literally up/down — invert flips which
  // arrow direction is treated as favorable.
  const trend = direction == null || direction === 'flat'
    ? direction
    : invert ? (direction === 'up' ? 'down' : 'up') : direction

  const raw = isNumeric ? animated : value

  const displayValue =
    format === 'currency'
      ? `Rs. ${formatNumber(raw)}`
      : format === 'percent'
      ? `${Number(raw || 0).toFixed(1)}%`
      : formatNumber(raw)

  return (
    <div
      className={cn('group relative overflow-hidden', className)}
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        padding: '20px',
        paddingTop: '24px',
        boxShadow: 'var(--shadow-card)',
        transition: 'box-shadow .2s ease',
        cursor: 'default',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = 'var(--shadow-md)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'var(--shadow-card)'
      }}
    >
      {/* Flat top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-0.75 pointer-events-none"
        style={{ background: accent.solid }}
      />

      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1 pr-2">
          <p
            className="text-[10px] font-bold uppercase tracking-widest mb-2 truncate section-label"
          >
            {title}
          </p>
          <p
            className="text-[28px] font-bold leading-none num tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            {displayValue}
            {unit && (
              <span
                className="text-[12px] font-medium ml-1.5"
                style={{ color: 'var(--text-muted)' }}
              >
                {unit}
              </span>
            )}
          </p>
        </div>

        {Icon && (
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              background: `${accent.solid}14`,
              borderRadius: 'var(--r-md)',
              width: '40px',
              height: '40px',
            }}
          >
            <Icon style={{ width: '18px', height: '18px', color: accent.solid }} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 min-h-5">
        {change != null ? (
          <span
            className="inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-md"
            style={{
              background: trend === 'up'   ? 'rgba(34,197,94,.1)'
                        : trend === 'down' ? 'rgba(239,68,68,.1)'
                        : 'var(--surface-muted)',
              color: trend === 'up' ? '#16A34A' : trend === 'down' ? '#DC2626' : 'var(--text-muted)',
            }}
          >
            {/* Color reflects good/bad (via trend/invert); the arrow itself still reflects the real numeric direction. */}
            {direction === 'up'   && <TrendingUp  style={{ width: '11px', height: '11px' }} />}
            {direction === 'down' && <TrendingDown style={{ width: '11px', height: '11px' }} />}
            {direction === 'flat' && <Minus        style={{ width: '11px', height: '11px' }} />}
            {Math.abs(change).toFixed(1)}%
          </span>
        ) : null}
        {(changeLabel || subtitle) && (
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {changeLabel || subtitle}
          </span>
        )}
      </div>
    </div>
  )
})
