import { memo } from 'react'
import {
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts'
import { CHART_COLORS } from '@/constants'
import { PieChartTooltip as CustomTooltip } from './ChartTooltip'
import { ChartEmptyState } from './ChartEmptyState'

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


export const PieChart = memo(function PieChart({
  data = [],
  nameKey = 'name',
  valueKey = 'value',
  height = 280,
  donut = false,
  colors = defaultColors,
  emptyMessage,
  formatValue,
}) {
  const innerRadius = donut ? '52%' : 0

  if (data.length === 0) return <ChartEmptyState height={height} message={emptyMessage} />

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

        <Tooltip content={<CustomTooltip formatValue={formatValue} />} />

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
})
