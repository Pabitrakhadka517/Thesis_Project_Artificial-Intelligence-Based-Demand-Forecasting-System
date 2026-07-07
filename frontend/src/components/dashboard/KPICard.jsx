import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn, formatNumber } from '@/utils'

const ACCENT = {
  blue:   { top: '#03045e', icon: '#03045e', iconColor: '#BFDBFE', glow: 'rgba(37,99,235,.20)',  solid: '#2563EB' },
  green:  { top: 'linear-gradient(90deg,#15803D,#22C55E)', icon: 'linear-gradient(135deg,#166534,#22C55E)', iconColor: '#BBF7D0', glow: 'rgba(34,197,94,.18)',   solid: '#22C55E' },
  purple: { top: 'linear-gradient(90deg,#6D28D9,#8B5CF6)', icon: 'linear-gradient(135deg,#5B21B6,#8B5CF6)', iconColor: '#DDD6FE', glow: 'rgba(139,92,246,.20)', solid: '#8B5CF6' },
  amber:  { top: 'linear-gradient(90deg,#B45309,#F59E0B)', icon: 'linear-gradient(135deg,#92400E,#F59E0B)', iconColor: '#FDE68A', glow: 'rgba(245,158,11,.18)',  solid: '#F59E0B' },
  red:    { top: 'linear-gradient(90deg,#B91C1C,#EF4444)', icon: 'linear-gradient(135deg,#991B1B,#EF4444)', iconColor: '#FECACA', glow: 'rgba(239,68,68,.20)',  solid: '#EF4444' },
  cyan:   { top: 'linear-gradient(90deg,#0E7490,#06B6D4)', icon: 'linear-gradient(135deg,#155E75,#06B6D4)', iconColor: '#A5F3FC', glow: 'rgba(6,182,212,.18)',   solid: '#06B6D4' },
  indigo: { top: 'linear-gradient(90deg,#4338CA,#6366F1)', icon: 'linear-gradient(135deg,#3730A3,#6366F1)', iconColor: '#C7D2FE', glow: 'rgba(99,102,241,.20)', solid: '#6366F1' },
  teal:   { top: 'linear-gradient(90deg,#0F766E,#14B8A6)', icon: 'linear-gradient(135deg,#134E4A,#2DD4BF)', iconColor: '#99F6E4', glow: 'rgba(20,184,166,.18)',  solid: '#14B8A6' },
  orange: { top: 'linear-gradient(90deg,#C2410C,#F97316)', icon: 'linear-gradient(135deg,#9A3412,#F97316)', iconColor: '#FED7AA', glow: 'rgba(249,115,22,.20)', solid: '#F97316' },
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

export function KPICard({
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
}) {
  const isNumeric = value != null && !isNaN(Number(value))
  const animated  = useCountUp(isNumeric ? Number(value) : null)

  if (loading) return <Skeleton />

  const accent = ACCENT[color] || ACCENT.blue
  const trend  = change == null ? null : change > 0 ? 'up' : change < 0 ? 'down' : 'flat'

  const raw = isNumeric ? animated : value

  const displayValue =
    format === 'currency'
      ? `Rs. ${formatNumber(raw)}`
      : format === 'percent'
      ? `${Number(raw || 0).toFixed(1)}%`
      : formatNumber(raw)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn('group relative overflow-hidden', className)}
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        padding: '20px',
        paddingTop: '24px',
        boxShadow: 'var(--shadow-card)',
        transition: 'box-shadow .2s ease, transform .2s ease',
        cursor: 'default',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = `0 8px 28px ${accent.glow}, 0 4px 12px rgba(0,0,0,.06)`
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'var(--shadow-card)'
        e.currentTarget.style.transform = 'none'
      }}
    >
      {/* Gradient top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-0.75 pointer-events-none"
        style={{ background: accent.top }}
      />

      {/* Background glow blob */}
      <div
        className="absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-[.07] blur-3xl pointer-events-none"
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
            className="text-[28px] font-bold leading-none num tracking-tight value-updated"
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
            className="rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: accent.icon,
              width: '44px',
              height: '44px',
              boxShadow: `0 4px 14px ${accent.glow}`,
            }}
          >
            <Icon style={{ width: '20px', height: '20px', color: accent.iconColor }} />
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
            {trend === 'up'   && <TrendingUp  style={{ width: '11px', height: '11px' }} />}
            {trend === 'down' && <TrendingDown style={{ width: '11px', height: '11px' }} />}
            {trend === 'flat' && <Minus        style={{ width: '11px', height: '11px' }} />}
            {Math.abs(change).toFixed(1)}%
          </span>
        ) : null}
        {(changeLabel || subtitle) && (
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {changeLabel || subtitle}
          </span>
        )}
      </div>
    </motion.div>
  )
}
