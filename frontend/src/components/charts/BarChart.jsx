import {
  ResponsiveContainer,
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts'
import { CHART_COLORS } from '@/constants'

const defaultColors = Object.values(CHART_COLORS)

function CustomTooltip({ active, payload, label, formatX, formatY }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
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
            borderRadius: '2px',
            background: entry.fill || entry.color,
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

export function BarChart({
  data = [],
  bars = [],
  xKey = 'label',
  height = 300,
  stacked = false,
  horizontal = false,
  formatXAxis,
  formatYAxis,
  colorByIndex = false,
}) {
  const layout = horizontal ? 'vertical' : 'horizontal'

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ReBarChart
        data={data}
        layout={layout}
        margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
        barCategoryGap="30%"
        barGap={4}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border-subtle)"
          strokeOpacity={1}
          horizontal={!horizontal}
          vertical={horizontal}
        />

        {horizontal ? (
          <>
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'inherit' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatXAxis}
            />
            <YAxis
              type="category"
              dataKey={xKey}
              tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'inherit' }}
              axisLine={false}
              tickLine={false}
              width={88}
              tickFormatter={v => v?.length > 14 ? v.slice(0, 14) + '…' : v}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'inherit' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatXAxis}
              dy={4}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'inherit' }}
              axisLine={false}
              tickLine={false}
              width={54}
              tickFormatter={formatYAxis}
            />
          </>
        )}

        <Tooltip
          content={<CustomTooltip formatX={horizontal ? formatXAxis : undefined} formatY={horizontal ? formatXAxis : formatYAxis} />}
          cursor={{ fill: 'var(--surface-muted)', opacity: 0.5 }}
        />

        <Legend
          wrapperStyle={{
            fontSize: '11px',
            paddingTop: '10px',
            color: 'var(--text-secondary)',
          }}
        />

        {bars.map((bar, i) => {
          const color = bar.color || defaultColors[i % defaultColors.length]
          const barRadius = stacked ? undefined : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]
          return (
            <Bar
              key={bar.key}
              dataKey={bar.key}
              name={bar.label || bar.key}
              fill={colorByIndex ? undefined : color}
              stackId={stacked ? 'stack' : undefined}
              radius={barRadius}
              maxBarSize={52}
              isAnimationActive={true}
              animationDuration={600}
            >
              {colorByIndex && data.map((_, di) => (
                <Cell key={di} fill={defaultColors[di % defaultColors.length]} />
              ))}
            </Bar>
          )
        })}
      </ReBarChart>
    </ResponsiveContainer>
  )
}
