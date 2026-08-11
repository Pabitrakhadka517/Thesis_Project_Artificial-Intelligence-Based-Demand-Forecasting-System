import { memo } from 'react'
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
import { ChartTooltip as CustomTooltip } from './ChartTooltip'
import { ChartEmptyState } from './ChartEmptyState'

const defaultColors = Object.values(CHART_COLORS)

export const BarChart = memo(function BarChart({
  data = [],
  bars = [],
  xKey = 'label',
  height = 300,
  stacked = false,
  horizontal = false,
  formatXAxis,
  formatYAxis,
  colorByIndex = false,
  emptyMessage,
}) {
  const layout = horizontal ? 'vertical' : 'horizontal'

  if (data.length === 0) return <ChartEmptyState height={height} message={emptyMessage} />

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

        {bars.length > 1 && (
          <Legend
            wrapperStyle={{
              fontSize: '11px',
              paddingTop: '10px',
              color: 'var(--text-secondary)',
            }}
          />
        )}

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
})
