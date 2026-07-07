import {
  ResponsiveContainer,
  LineChart as ReLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Brush,
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
            background: entry.stroke || entry.color,
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

export function LineChart({
  data = [],
  lines = [],
  xKey = 'date',
  height = 300,
  showBrush = false,
  formatXAxis,
  formatYAxis,
  referenceLines = [],
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ReLineChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border-subtle)"
          strokeOpacity={1}
          vertical={false}
        />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'inherit' }}
          tickFormatter={formatXAxis}
          axisLine={false}
          tickLine={false}
          dy={4}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'inherit' }}
          tickFormatter={formatYAxis}
          axisLine={false}
          tickLine={false}
          width={54}
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
          />
        ))}

        {lines.map((line, i) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={line.label || line.key}
            stroke={line.color || defaultColors[i % defaultColors.length]}
            strokeWidth={line.dashed ? 1.5 : 2}
            strokeDasharray={line.dashed ? '5 3' : undefined}
            dot={false}
            activeDot={{
              r: 4,
              stroke: line.color || defaultColors[i % defaultColors.length],
              strokeWidth: 2,
              fill: 'var(--surface-card)',
            }}
            isAnimationActive={true}
            animationDuration={600}
          />
        ))}

        {showBrush && (
          <Brush
            height={20}
            stroke="var(--border)"
            fill="var(--surface-muted)"
            travellerWidth={6}
          />
        )}
      </ReLineChart>
    </ResponsiveContainer>
  )
}
