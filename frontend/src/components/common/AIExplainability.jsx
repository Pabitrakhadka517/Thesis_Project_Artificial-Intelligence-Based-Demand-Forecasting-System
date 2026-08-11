import { Info } from 'lucide-react'
import { cn, formatNumber } from '@/utils'

const fmt = (v, unit = '') => (v == null ? '—' : `${formatNumber(Math.round(v))}${unit ? ` ${unit}` : ''}`)

/**
 * Renders the reasoning chain behind one AI purchase recommendation —
 * Current Stock, Forecast Demand, Supplier Lead Time, Safety Stock, Reorder
 * Point, Suggested Purchase, and the model's prose Reasoning — as a labeled
 * "why" breakdown instead of a single opaque number. Each row carries a
 * one-line caption showing how it was derived from the row above it, so the
 * causal chain (not just the final figure) is visible.
 *
 * Accepts the same card shape returned by dashboard.controller.js /
 * ai.controller.js (camelCase: currentStock, forecastDemand, dailyDemand,
 * safetyStock, leadTimeDays, reorderPoint, eoq, suggestedPurchase,
 * explanation/reason, isRuleBased, hasHistoricalData). Every field is
 * optional — a not-yet-analyzed (rule-based) product renders "—" for the
 * fields it doesn't have rather than breaking.
 */
export function AIExplainability({
  currentStock,
  unit = 'units',
  forecastDemand,
  dailyDemand,
  leadTimeDays,
  safetyStock,
  reorderPoint,
  eoq,
  suggestedPurchase,
  reasoning,
  isRuleBased = false,
  hasHistoricalData = true,
  compact = false,
  className,
}) {
  const rows = [
    {
      label: 'Current Stock',
      value: fmt(currentStock, unit),
      caption: 'What’s on hand right now.',
    },
    {
      label: 'Forecast Demand',
      value: forecastDemand != null ? fmt(forecastDemand, unit) : '—',
      caption: dailyDemand != null
        ? `Predicted demand over the horizon, ~${Number(dailyDemand).toFixed(1)} ${unit}/day.`
        : isRuleBased
          ? 'Not yet AI-analyzed — no forecast available.'
          : 'Predicted demand over the forecast horizon.',
    },
    {
      label: 'Supplier Lead Time',
      value: leadTimeDays != null ? `${leadTimeDays} day${leadTimeDays === 1 ? '' : 's'}` : '—',
      caption: 'Time from placing an order to it arriving — both Safety Stock and Reorder Point are sized against this.',
    },
    {
      label: 'Safety Stock',
      value: safetyStock != null ? fmt(safetyStock, unit) : '—',
      caption: safetyStock != null
        ? `Buffer against demand variability during the ${leadTimeDays ?? '?'}-day lead time (95% service level).`
        : 'Not yet AI-analyzed — using the product’s manual reorder level instead.',
    },
    {
      label: 'Reorder Point',
      value: fmt(reorderPoint, unit),
      caption: safetyStock != null
        ? `Demand expected during the lead time, plus Safety Stock (${fmt(safetyStock, unit)}).`
        : 'The stock level that triggers a reorder.',
    },
    {
      label: 'Suggested Purchase',
      value: fmt(suggestedPurchase, unit),
      caption: eoq != null
        ? `max(Economic Order Quantity: ${fmt(eoq, unit)}, gap to Reorder Point) — never both added together.`
        : 'Estimated shortfall to close the gap to the reorder point.',
      emphasize: true,
    },
  ]

  return (
    <div className={cn('rounded-lg', className)} style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1">
        <Info style={{ width: 12, height: 12, color: 'var(--text-muted)' }} />
        <span className="section-label">Why this recommendation</span>
        {isRuleBased && (
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded ml-auto"
            style={{ background: 'var(--surface-card)', color: 'var(--text-muted)' }}>
            Rule-based · not yet AI-analyzed
          </span>
        )}
        {!isRuleBased && !hasHistoricalData && (
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded ml-auto"
            style={{ background: 'var(--tint-warning)', color: 'var(--brand-amber)' }}>
            Limited history
          </span>
        )}
      </div>

      <dl className="px-3 pb-2.5">
        {rows.map(({ label, value, caption, emphasize }) => (
          <div key={label} className={cn('py-1.5', !compact && 'grid grid-cols-[1fr,auto] gap-x-3 items-baseline')}
            style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <dt className={compact ? 'flex items-baseline justify-between gap-2' : 'contents'}>
              <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
              {compact && (
                <span className="text-[12.5px] font-bold" style={{ color: emphasize ? 'var(--brand-blue)' : 'var(--text-primary)' }}>
                  {value}
                </span>
              )}
            </dt>
            {!compact && (
              <dd className="text-[12.5px] font-bold text-right" style={{ color: emphasize ? 'var(--brand-blue)' : 'var(--text-primary)', margin: 0 }}>
                {value}
              </dd>
            )}
            {!compact && (
              <p className="col-span-2 text-[10.5px] leading-snug mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {caption}
              </p>
            )}
          </div>
        ))}
      </dl>

      {reasoning && (
        <div className="px-3 pb-3 pt-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>
            Reasoning
          </p>
          <p className="text-[12px] leading-relaxed italic" style={{ color: 'var(--text-secondary)' }}>
            {reasoning}
          </p>
        </div>
      )}
    </div>
  )
}
