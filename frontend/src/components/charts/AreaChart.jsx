import {
  ResponsiveContainer,
  AreaChart as ReAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
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

export function AreaChart({
  data = [],
  areas = [],
  xKey = 'date',
  height = 300,
  formatXAxis,
  formatYAxis,
  referenceLines = [],
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ReAreaChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
        <defs>
          {areas.map((area, i) => {
            const color = area.color || defaultColors[i % defaultColors.length]
            return (
              <linearGradient key={area.key} id={`grad-${area.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            )
          })}
        </defs>

        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border-subtle)"
          strokeOpacity={1}
          vertical={false}
        />

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

        <Tooltip
          content={<CustomTooltip formatX={formatXAxis} formatY={formatYAxis} />}
          cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4' }}
        />

        <Legend
          wrapperStyle={{
            fontSize: '11px',
            paddingTop: '10px',
            color: 'var(--text-secondary)',
          }}
        />

        {referenceLines.map((rl, i) => (
          <ReferenceLine
            key={i}
            y={rl.y}
            x={rl.x}
            stroke={rl.color || 'var(--text-muted)'}
            strokeDasharray="4 4"
            strokeWidth={1}
            label={rl.label ? {
              value: rl.label,
              fontSize: 10,
              fill: rl.color || 'var(--text-muted)',
            } : undefined}
          />
        ))}

        {areas.map((area, i) => {
          const color = area.color || defaultColors[i % defaultColors.length]
          return (
            <Area
              key={area.key}
              type="monotone"
              dataKey={area.key}
              name={area.label || area.key}
              stroke={color}
              strokeWidth={2}
              fill={`url(#grad-${area.key})`}
              dot={false}
              activeDot={{
                r: 4,
                stroke: color,
                strokeWidth: 2,
                fill: 'var(--surface-card)',
              }}
              isAnimationActive={true}
              animationDuration={600}
            />
          )
        })}
      </ReAreaChart>
    </ResponsiveContainer>
  )
}
