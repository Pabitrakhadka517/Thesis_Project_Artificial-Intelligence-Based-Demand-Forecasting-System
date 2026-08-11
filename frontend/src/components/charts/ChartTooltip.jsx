/**
 * Shared recharts tooltip renderers. Extracted from near-identical copies
 * previously duplicated inside AreaChart/BarChart/LineChart/PieChart, and
 * duplicated again per-page (AdminDashboard/ReportsPage/ProductDetailPage/
 * SuppliersPage). Same {active, payload, label} shape recharts already
 * passes everywhere — drop-in replacement for any custom `<Tooltip content>`.
 */

export function ChartTooltip({ active, payload, label, formatX, formatY }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      padding: '10px 14px',
      boxShadow: 'var(--shadow-lg)',
      fontSize: '12px',
      minWidth: '130px',
    }}>
      {label != null && (
        <p style={{
          color: 'var(--text-muted)',
          marginBottom: '8px',
          fontSize: '11px',
          fontWeight: 600,
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '6px',
        }}>
          {formatX ? formatX(label) : label}
        </p>
      )}
      {payload.map((entry, i) => (
        <div key={i} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: i < payload.length - 1 ? '4px' : 0,
        }}>
          <span style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: entry.stroke || entry.fill || entry.color,
            flexShrink: 0,
          }} />
          <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{entry.name}</span>
          <span style={{
            color: 'var(--text-primary)',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            marginLeft: '4px',
          }}>
            {formatY
              ? formatY(entry.value)
              : entry.value != null ? Number(entry.value).toLocaleString() : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Single-entry variant used by PieChart (one hovered slice, no axis label). */
export function PieChartTooltip({ active, payload, formatValue }) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  return (
    <div style={{
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      padding: '10px 14px',
      boxShadow: 'var(--shadow-lg)',
      fontSize: '12px',
      minWidth: '120px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{
          display: 'inline-block',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: entry.payload?.fill || entry.color,
          flexShrink: 0,
        }} />
        <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{entry.name}</span>
        <span style={{
          color: 'var(--text-primary)',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          marginLeft: '4px',
        }}>
          {entry.value == null ? '—' : formatValue ? formatValue(entry.value) : Number(entry.value).toLocaleString()}
        </span>
      </div>
      {entry.payload?.pct != null && (
        <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '3px', textAlign: 'right' }}>
          {entry.payload.pct}%
        </p>
      )}
    </div>
  )
}
