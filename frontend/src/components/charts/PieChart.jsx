import {
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts'
import { CHART_COLORS } from '@/constants'

const defaultColors = Object.values(CHART_COLORS)

const RADIAN = Math.PI / 180

function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.06) return null
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text
      x={x} y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={600}
      style={{ pointerEvents: 'none' }}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  return (
    <div style={{
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
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
          {entry.value != null ? Number(entry.value).toLocaleString() : '—'}
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

export function PieChart({
  data = [],
  nameKey = 'name',
  valueKey = 'value',
  height = 280,
  donut = false,
  colors = defaultColors,
}) {
  const innerRadius = donut ? '52%' : 0

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RePieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius="72%"
          dataKey={valueKey}
          nameKey={nameKey}
          labelLine={false}
          label={!donut ? renderCustomLabel : undefined}
          paddingAngle={donut ? 2 : 0}
          isAnimationActive={true}
          animationDuration={700}
          animationBegin={100}
        >
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={colors[i % colors.length]}
              stroke="var(--surface-card)"
              strokeWidth={2}
            />
          ))}
        </Pie>

        <Tooltip content={<CustomTooltip />} />

        <Legend
          wrapperStyle={{
            fontSize: '11px',
            color: 'var(--text-secondary)',
            paddingTop: '8px',
          }}
          formatter={(value) => (
            <span style={{ color: 'var(--text-secondary)' }}>{value}</span>
          )}
        />
      </RePieChart>
    </ResponsiveContainer>
  )
}
