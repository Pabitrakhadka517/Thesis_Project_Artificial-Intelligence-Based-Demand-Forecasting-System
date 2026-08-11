import { memo } from 'react'
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
import { ChartTooltip as CustomTooltip } from './ChartTooltip'
import { ChartEmptyState } from './ChartEmptyState'

const defaultColors = Object.values(CHART_COLORS)

export const LineChart = memo(function LineChart({
  data = [],
  lines = [],
  xKey = 'date',
  height = 300,
  showBrush = false,
  formatXAxis,
  formatYAxis,
  referenceLines = [],
  emptyMessage,
}) {
  if (data.length === 0) return <ChartEmptyState height={height} message={emptyMessage} />

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
        {lines.length > 1 && (
          <Legend
            wrapperStyle={{
              fontSize: '11px',
              paddingTop: '10px',
              color: 'var(--text-secondary)',
            }}
          />
        )}

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
})
