import { cn } from '@/utils'

/**
 * Canonical pill tab-strip. Replaces the ~5 divergent tab implementations
 * that had grown across AdminDashboard/ReportsPage/AnalyticsPage/
 * SuppliersPage/ForecastingPage/RecommendationsPage.
 *
 * items: [{ value, label, icon?, color?, count? }]
 * `color` (a CSS color string, e.g. from constants/statusColors.js) renders
 * a small accent dot next to the label for tabs where color carries meaning
 * (e.g. report type). Purely presentational — selection logic stays with
 * the caller's own `value`/`onChange` state.
 */
export function Tabs({ items, value, onChange, className }) {
  return (
    <div
      role="tablist"
      className={cn('inline-flex items-center gap-1 flex-wrap p-1', className)}
      style={{
        background: 'var(--surface-muted)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
      }}
    >
      {items.map((item) => {
        const active = item.value === value
        const Icon = item.icon
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap transition-colors"
            style={{
              padding: '6px 13px',
              fontSize: '12.5px',
              borderRadius: 'var(--r-md)',
              background: active ? 'var(--surface-card)' : 'transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: active ? 'var(--shadow-xs)' : 'none',
            }}
          >
            {item.color && (
              <span
                style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: item.color, flexShrink: 0,
                }}
              />
            )}
            {Icon && <Icon style={{ width: '13px', height: '13px', flexShrink: 0 }} />}
            {item.label}
            {item.count != null && (
              <span
                className="text-[10px] font-bold"
                style={{
                  padding: '1px 5px',
                  borderRadius: '10px',
                  background: active ? 'var(--surface-muted)' : 'var(--surface-card)',
                  color: 'var(--text-muted)',
                }}
              >
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
