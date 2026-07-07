/**
 * Advanced analytics tab — four sections:
 *   1. Forecast vs Actual comparison
 *   2. Inventory health score
 *   3. Supplier performance
 *   4. Festival demand spike detection
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp, Heart, Truck, Star, ChevronDown,
  CalendarDays, AlertTriangle, CheckCircle2, Zap,
} from 'lucide-react'
import { analyticsService } from '@/services/analyticsService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/common/Card'
import { BarChart } from '@/components/charts/BarChart'
import { LineChart } from '@/components/charts/LineChart'
import { SkeletonChart, SkeletonTable } from '@/components/common/Skeleton'
import { ErrorState } from '@/components/common/ErrorState'
import { formatNumber } from '@/utils'

// ── Palette ───────────────────────────────────────────────────────────────────

const GRADE_COLOR = { A: '#22C55E', B: '#3B82F6', C: '#F59E0B', D: '#F97316', F: '#EF4444' }
const GRADE_BG    = { A: '#DCFCE7', B: '#DBEAFE', C: '#FEF3C7', D: '#FFEDD5', F: '#FEE2E2' }
const MODEL_COLOR = { prophet: '#2563EB', rf: '#22C55E', lstm: '#8B5CF6' }
const FESTIVAL_COLORS = { dashain: '#F59E0B', tihar: '#EC4899' }

// ── Shared atoms ──────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, subtitle, color = '#2563EB' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px' }}>
      <div style={{
        width: '32px', height: '32px', borderRadius: '8px',
        background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h2>
        {subtitle && <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '1px' }}>{subtitle}</p>}
      </div>
    </div>
  )
}

function GradeBadge({ grade, size = 'sm' }) {
  const isLg = size === 'lg'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: isLg ? '48px' : '28px', height: isLg ? '48px' : '28px',
      borderRadius: isLg ? '12px' : '7px',
      background: GRADE_BG[grade]  || '#F3F4F6',
      color:      GRADE_COLOR[grade] || '#6B7280',
      fontWeight: 700, fontSize: isLg ? '22px' : '12px',
    }}>
      {grade}
    </span>
  )
}

function KpiChip({ label, value, color = '#2563EB', sub }) {
  return (
    <div style={{
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${color}`,
      borderRadius: '10px',
      padding: '12px 16px',
    }}>
      <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>{label}</p>
      <p style={{ fontSize: '22px', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{sub}</p>}
    </div>
  )
}

function SelectDays({ value, onChange, options }) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          appearance: 'none', paddingRight: '24px', paddingLeft: '10px',
          paddingTop: '6px', paddingBottom: '6px',
          fontSize: '12px', fontWeight: 600, borderRadius: '8px',
          background: 'var(--surface-input)', border: '1.5px solid var(--border)',
          color: 'var(--text-primary)', cursor: 'pointer', outline: 'none',
        }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={13} style={{
        position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
        pointerEvents: 'none', color: 'var(--text-muted)',
      }} />
    </div>
  )
}

// ── Section 1: Forecast vs Actual ─────────────────────────────────────────────

const FC_DAY_OPTIONS = [
  { value: 14,  label: '14 days' },
  { value: 30,  label: '30 days' },
  { value: 60,  label: '60 days' },
  { value: 90,  label: '90 days' },
]

function ForecastSection() {
  const [days, setDays] = useState(30)

  const { data, isLoading, error } = useQuery({
    queryKey: ['advanced', 'forecast-comparison', days],
    queryFn: () => analyticsService.getAdvancedForecastComparison(days).then(r => r.data),
    staleTime: 120_000,
  })

  const lines = [
    { key: 'actual',  label: 'Actual',        color: MODEL_COLOR.prophet },
    { key: 'prophet', label: 'Prophet',        color: '#22C55E', dashed: true },
    { key: 'rf',      label: 'Random Forest',  color: '#F59E0B', dashed: true },
    { key: 'lstm',    label: 'LSTM',           color: '#8B5CF6', dashed: true },
  ]

  const accuracy = data?.model_accuracy || []
  const best     = data?.best_model

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={TrendingUp} color="#2563EB"
        title="Forecast vs Actual Comparison"
        subtitle="Aggregate predicted demand vs real sales across all three AI models"
      />

      <Card>
        <CardHeader>
          <CardTitle>Daily Demand — Actual vs Models</CardTitle>
          <SelectDays value={days} onChange={setDays} options={FC_DAY_OPTIONS} />
        </CardHeader>
        <CardContent>
          {error   ? <ErrorState error={error} /> :
           isLoading ? <SkeletonChart height={260} /> : (
            <LineChart
              data={data?.daily_comparison || []}
              lines={lines}
              xKey="date"
              height={260}
              formatXAxis={v => {
                const d = new Date(v)
                return `${d.getDate()}/${d.getMonth() + 1}`
              }}
              formatYAxis={v => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v}
            />
          )}
        </CardContent>
      </Card>

      {/* Model accuracy table */}
      {accuracy.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Model Accuracy Metrics</CardTitle>
            {best && (
              <span style={{
                fontSize: '11px', fontWeight: 600, padding: '3px 10px',
                borderRadius: '9999px', background: '#DCFCE7', color: '#16A34A',
              }}>
                Best: {best === 'prophet' ? 'Prophet' : best === 'rf' ? 'Random Forest' : 'LSTM'}
              </span>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Model', 'MAPE (%)', 'MAE', 'RMSE', 'WAPE (%)', 'SKU Coverage'].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: h === 'Model' ? 'left' : 'right',
                      fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.04em', color: 'var(--text-muted)',
                      background: 'var(--surface-muted)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accuracy.map((row, i) => (
                  <tr key={row.model} style={{ borderBottom: '1px solid var(--border-subtle)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-muted)' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          width: '10px', height: '10px', borderRadius: '50%',
                          background: MODEL_COLOR[row.model] || '#94A3B8',
                          display: 'inline-block', flexShrink: 0,
                        }} />
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.display_name}</span>
                        {row.model === best && (
                          <span style={{ fontSize: '10px', background: '#DCFCE7', color: '#16A34A', padding: '1px 6px', borderRadius: '9999px', fontWeight: 600 }}>best</span>
                        )}
                      </div>
                    </td>
                    {[row.avg_mape, row.avg_mae, row.avg_rmse, row.avg_wape, row.sku_coverage].map((v, j) => (
                      <td key={j} style={{
                        padding: '10px 14px', textAlign: 'right',
                        color: j === 0 && v > 0 ? (v < 10 ? '#22C55E' : v < 25 ? '#F59E0B' : '#EF4444') : 'var(--text-secondary)',
                        fontWeight: j === 0 ? 700 : 400,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {v > 0 ? (j < 4 ? v.toFixed(2) : formatNumber(v)) : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Total actual KPI */}
      {data?.total_actual_qty > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
          <KpiChip label={`Actual Units Sold (${days}d)`} value={formatNumber(data.total_actual_qty)} color="#2563EB" />
          {data.computed_mape && Object.entries(data.computed_mape).map(([m, mape]) => (
            <KpiChip
              key={m}
              label={`${m === 'prophet' ? 'Prophet' : m === 'rf' ? 'RF' : 'LSTM'} Computed MAPE`}
              value={mape > 0 ? `${mape.toFixed(1)}%` : '—'}
              color={MODEL_COLOR[m]}
              sub="vs actual sales"
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Section 2: Inventory Health Score ─────────────────────────────────────────

const GRADE_LABELS = { A: 'Excellent', B: 'Good', C: 'Fair', D: 'Poor', F: 'Critical' }

function HealthSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['advanced', 'inventory-health'],
    queryFn: () => analyticsService.getInventoryHealth().then(r => r.data),
    staleTime: 120_000,
  })

  const gradeData = data
    ? ['A','B','C','D','F'].map(g => ({
        name:  `Grade ${g}`,
        value: data.grade_distribution[g] || 0,
        color: GRADE_COLOR[g],
      })).filter(d => d.value > 0)
    : []

  const catData = (data?.category_health || []).map(c => ({
    name:  c.category.length > 14 ? c.category.slice(0, 14) + '…' : c.category,
    score: c.avg_score,
  }))

  const worstItems = (data?.items || []).slice(0, 10)

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Heart} color="#EF4444"
        title="Inventory Health Score"
        subtitle="Composite score (0–100) per SKU weighing stock adequacy, stockout risk, overstock exposure, and demand stability"
      />

      {/* Portfolio score + grade distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Big score card */}
        <Card style={{ textAlign: 'center', padding: '24px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '12px' }}>Portfolio Health</p>
          {isLoading ? (
            <div className="skeleton h-20 w-32 mx-auto rounded" />
          ) : (
            <>
              <div style={{
                fontSize: '56px', fontWeight: 900, lineHeight: 1,
                color: GRADE_COLOR[data?.portfolio_grade] || '#94A3B8',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {data?.portfolio_score ?? '—'}
              </div>
              <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'center', gap: '10px', alignItems: 'center' }}>
                <GradeBadge grade={data?.portfolio_grade || '—'} size="lg" />
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {GRADE_LABELS[data?.portfolio_grade] || ''}
                </span>
              </div>
              <p style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
                {data?.total_skus} SKUs analyzed
              </p>
            </>
          )}
        </Card>

        {/* Grade distribution */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Grade Distribution</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <SkeletonChart height={140} /> : (
              <div className="space-y-2">
                {['A','B','C','D','F'].map(g => {
                  const count = data?.grade_distribution?.[g] || 0
                  const total = data?.total_skus || 1
                  const pct   = Math.round(count / total * 100)
                  return (
                    <div key={g} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <GradeBadge grade={g} />
                      <div style={{ flex: 1 }}>
                        <div style={{ height: '8px', borderRadius: '9999px', background: 'var(--surface-muted)', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', width: `${pct}%`,
                            background: GRADE_COLOR[g],
                            borderRadius: '9999px',
                            transition: 'width 0.6s ease',
                          }} />
                        </div>
                      </div>
                      <span style={{ width: '40px', textAlign: 'right', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        {count}
                      </span>
                      <span style={{ width: '36px', textAlign: 'right', fontSize: '11px', color: 'var(--text-muted)' }}>
                        {pct}%
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Category health bar chart */}
      {catData.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Health Score by Category</CardTitle></CardHeader>
          <CardContent>
            <BarChart
              data={catData}
              bars={[{ key: 'score', label: 'Health Score', color: '#3B82F6', colorByIndex: false }]}
              xKey="name"
              height={220}
              formatYAxis={v => v}
            />
          </CardContent>
        </Card>
      )}

      {/* Worst items table */}
      {worstItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Lowest Health SKUs</CardTitle>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Items requiring immediate attention</span>
          </CardHeader>
          <CardContent className="p-0">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['SKU', 'Category', 'Score', 'Grade', 'Status', 'DoS (days)', 'Stockout Risk', 'Adequacy', 'Stability'].map(h => (
                    <th key={h} style={{
                      padding: '8px 12px', textAlign: h === 'SKU' || h === 'Category' ? 'left' : 'center',
                      fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.04em', color: 'var(--text-muted)',
                      background: 'var(--surface-muted)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {worstItems.map((item, i) => (
                  <tr key={item.sku_id} style={{ borderBottom: '1px solid var(--border-subtle)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-muted)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.name || `SKU ${item.sku_id}`}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{item.category}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: GRADE_COLOR[item.grade] }}>{item.health_score}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}><GradeBadge grade={item.grade} /></td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '10px', fontWeight: 600, padding: '2px 8px',
                        borderRadius: '9999px', textTransform: 'capitalize',
                        background: item.stock_status === 'healthy' ? '#DCFCE7' : item.stock_status === 'critical' || item.stock_status === 'out_of_stock' ? '#FEE2E2' : '#FEF3C7',
                        color: item.stock_status === 'healthy' ? '#16A34A' : item.stock_status === 'critical' || item.stock_status === 'out_of_stock' ? '#DC2626' : '#B45309',
                      }}>
                        {(item.stock_status || '—').replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{item.days_of_supply}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: item.stockout_risk_pct > 50 ? '#EF4444' : item.stockout_risk_pct > 25 ? '#F59E0B' : '#22C55E', fontVariantNumeric: 'tabular-nums' }}>
                      {item.stockout_risk_pct}%
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <MiniBar value={item.components?.stock_adequacy} color="#3B82F6" />
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <MiniBar value={item.components?.demand_stability} color="#8B5CF6" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function MiniBar({ value = 0, color = '#3B82F6' }) {
  const pct = Math.round((value || 0) * 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
      <div style={{ width: '48px', height: '5px', borderRadius: '9999px', background: 'var(--surface-muted)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '9999px' }} />
      </div>
      <span style={{ fontSize: '10px', color: 'var(--text-muted)', width: '24px', textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

// ── Section 3: Supplier Performance ──────────────────────────────────────────

function SupplierSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['advanced', 'supplier-performance'],
    queryFn: () => analyticsService.getSupplierPerformance().then(r => r.data),
    staleTime: 120_000,
  })

  const suppliers = data?.suppliers || []
  const summary   = data?.summary   || {}

  const chartData = suppliers.map(s => ({
    name:  s.name.length > 14 ? s.name.slice(0, 14) + '…' : s.name,
    score: s.performance_score,
  }))

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Truck} color="#22C55E"
        title="Supplier Performance Analysis"
        subtitle="Reliability, stockout exposure, and supply coverage aggregated per supplier"
      />

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
        <KpiChip label="Total Suppliers"        value={isLoading ? '…' : formatNumber(summary.total_suppliers || 0)} color="#2563EB" />
        <KpiChip label="Avg Reliability Score"  value={isLoading ? '…' : summary.avg_reliability_score != null ? `${(summary.avg_reliability_score * 100).toFixed(1)}%` : '—'} color="#22C55E" />
        <KpiChip label="At-Risk Suppliers"      value={isLoading ? '…' : formatNumber(summary.at_risk_count || 0)} color="#EF4444" sub="Grade D or F" />
        <KpiChip label="Top Performer"          value={isLoading ? '…' : (summary.top_performer || '—')} color="#8B5CF6" />
      </div>

      {/* Performance bar chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Performance Score by Supplier</CardTitle></CardHeader>
          <CardContent>
            <BarChart
              data={chartData}
              bars={[{ key: 'score', label: 'Performance Score', color: '#22C55E', colorByIndex: false }]}
              xKey="name"
              height={220}
              formatYAxis={v => v}
            />
          </CardContent>
        </Card>
      )}

      {/* Supplier table */}
      {error ? (
        <Card><CardContent className="p-5"><ErrorState error={error} /></CardContent></Card>
      ) : isLoading ? (
        <Card><CardContent className="p-5"><SkeletonTable rows={6} cols={8} /></CardContent></Card>
      ) : suppliers.length === 0 ? (
        <Card><CardContent className="p-5" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No supplier data available.</CardContent></Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>Supplier Details</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Supplier', 'Score', 'Grade', 'SKUs', 'Critical Items', 'Avg Stockout Risk', 'Avg DoS (days)', 'Lead Time (days)', 'Reliability'].map(h => (
                      <th key={h} style={{
                        padding: '8px 12px', textAlign: h === 'Supplier' ? 'left' : 'center',
                        fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.04em', color: 'var(--text-muted)',
                        background: 'var(--surface-muted)', whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((sup, i) => (
                    <tr key={sup.id} style={{ borderBottom: '1px solid var(--border-subtle)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-muted)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{sup.name}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: GRADE_COLOR[sup.performance_grade], fontVariantNumeric: 'tabular-nums' }}>
                        {sup.performance_score}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}><GradeBadge grade={sup.performance_grade} /></td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{sup.sku_count}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span style={{
                          fontWeight: 700,
                          color: sup.critical_items > 0 ? '#EF4444' : '#22C55E',
                          fontVariantNumeric: 'tabular-nums',
                        }}>{sup.critical_items}</span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: sup.avg_stockout_risk > 0.5 ? '#EF4444' : sup.avg_stockout_risk > 0.25 ? '#F59E0B' : '#22C55E', fontWeight: 600 }}>
                        {(sup.avg_stockout_risk * 100).toFixed(1)}%
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{sup.avg_days_of_supply}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{sup.lead_time_days}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <MiniBar value={sup.reliability_score} color="#22C55E" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Section 4: Festival Demand Spike Detection ────────────────────────────────

const FEST_DAY_OPTIONS = [
  { value: 365,  label: '1 year'  },
  { value: 730,  label: '2 years' },
  { value: 1095, label: '3 years' },
]

function FestivalSection() {
  const [days, setDays] = useState(730)

  const { data, isLoading, error } = useQuery({
    queryKey: ['advanced', 'festival-demand', days],
    queryFn: () => analyticsService.getFestivalDemand(days).then(r => r.data),
    staleTime: 300_000,
  })

  const upcoming   = data?.upcoming_festivals  || []
  const spikes     = data?.historical_spikes   || []
  const topSkus    = data?.top_festival_skus   || []
  const weekly     = data?.weekly_demand       || []
  const summary    = data?.festival_summary    || {}

  // Weekly chart data — sample every 2 weeks for readability
  const weeklyChart = weekly.filter((_, i) => i % 2 === 0).map(w => ({
    label:           w.label,
    qty:             Math.round(w.total_qty),
    festival:        w.is_festival_week ? Math.round(w.total_qty) : 0,
    normal:          w.is_festival_week ? 0 : Math.round(w.total_qty),
    is_festival_week: w.is_festival_week,
  }))

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={CalendarDays} color="#F59E0B"
        title="Festival Demand Spike Detection"
        subtitle="Nepal festival proximity analysis — Dashain and Tihar demand uplift patterns"
      />

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
        <KpiChip label="Festival Daily Avg"  value={isLoading ? '…' : formatNumber(summary.avg_daily_festival_qty || 0)} color="#F59E0B" sub="units/day" />
        <KpiChip label="Normal Daily Avg"    value={isLoading ? '…' : formatNumber(summary.avg_daily_normal_qty   || 0)} color="#3B82F6" sub="units/day" />
        <KpiChip label="Festival Uplift"     value={isLoading ? '…' : summary.festival_uplift_pct != null ? `+${summary.festival_uplift_pct}%` : '—'} color="#22C55E" sub="vs normal days" />
        <KpiChip label="Festival Days"       value={isLoading ? '…' : formatNumber(summary.festival_days_analyzed || 0)} color="#EC4899" sub="analyzed" />
      </div>

      {/* Upcoming festivals */}
      {upcoming.length > 0 && (
        <div>
          <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>Upcoming Festivals</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
            {upcoming.map((f, i) => {
              const color = FESTIVAL_COLORS[f.festival_type] || '#3B82F6'
              const urgent = f.days_until <= 30
              return (
                <div key={i} style={{
                  background: 'var(--surface-card)',
                  border: `1.5px solid ${urgent ? color : 'var(--border)'}`,
                  borderLeft: `4px solid ${color}`,
                  borderRadius: '12px',
                  padding: '14px 16px',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  <div style={{ position: 'absolute', top: 0, right: 0, width: '80px', height: '80px', background: `${color}08`, borderRadius: '0 0 0 80px' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{f.name}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Peak: {f.peak_date}</p>
                    </div>
                    {urgent && (
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', background: `${color}20`, color }}>SOON</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
                    <div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' }}>Days Until</p>
                      <p style={{ fontWeight: 800, fontSize: '20px', color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{f.days_until}</p>
                    </div>
                    <div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' }}>Expected Uplift</p>
                      <p style={{ fontWeight: 700, fontSize: '14px', color: '#22C55E', lineHeight: 1.2, marginTop: '4px' }}>
                        +{f.expected_uplift_pct}%
                      </p>
                    </div>
                    <div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' }}>Window</p>
                      <p style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>{f.start_date} – {f.end_date}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Weekly demand chart */}
      {weeklyChart.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Weekly Demand — Festival vs Normal</CardTitle>
            <SelectDays value={days} onChange={setDays} options={FEST_DAY_OPTIONS} />
          </CardHeader>
          <CardContent>
            {isLoading ? <SkeletonChart height={240} /> : (
              <BarChart
                data={weeklyChart}
                bars={[
                  { key: 'normal',   label: 'Normal Week',   color: '#3B82F6' },
                  { key: 'festival', label: 'Festival Week',  color: '#F59E0B' },
                ]}
                xKey="label"
                height={240}
                formatYAxis={v => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Historical spikes */}
      {spikes.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Historical Dashain Spikes</CardTitle></CardHeader>
          <CardContent>
            <BarChart
              data={spikes.map(s => ({
                label: `Dashain ${s.year}`,
                festival: s.avg_daily_qty_festival,
                normal:   s.avg_daily_qty_normal,
              }))}
              bars={[
                { key: 'normal',   label: 'Normal Avg/Day',   color: '#3B82F6' },
                { key: 'festival', label: 'Festival Avg/Day',  color: '#F59E0B' },
              ]}
              xKey="label"
              height={200}
              formatYAxis={v => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v}
            />
          </CardContent>
        </Card>
      )}

      {/* Top festival-sensitive SKUs */}
      {topSkus.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Festival-Sensitive SKUs</CardTitle>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Ranked by demand uplift during festival windows</span>
          </CardHeader>
          <CardContent className="p-0">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['#', 'SKU', 'Category', 'Uplift', 'Festival Daily', 'Normal Daily', 'Ratio', 'Total Festival Qty'].map(h => (
                    <th key={h} style={{
                      padding: '8px 12px',
                      textAlign: h === 'SKU' || h === 'Category' ? 'left' : 'center',
                      fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.04em', color: 'var(--text-muted)',
                      background: 'var(--surface-muted)', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topSkus.slice(0, 15).map((sku, i) => (
                  <tr key={sku.sku_id} style={{ borderBottom: '1px solid var(--border-subtle)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-muted)' }}>
                    <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>{i + 1}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{sku.name}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{sku.category}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800, color: '#22C55E', fontVariantNumeric: 'tabular-nums' }}>
                      +{sku.uplift_pct}%
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: '#F59E0B', fontWeight: 600 }}>{sku.festival_avg_daily}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{sku.normal_avg_daily}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{sku.festival_ratio}×</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{formatNumber(sku.total_festival_qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

const ADVANCED_SECTIONS = [
  { id: 'forecast',  label: 'Forecast vs Actual', icon: TrendingUp,   color: '#2563EB', Component: ForecastSection  },
  { id: 'health',    label: 'Inventory Health',   icon: Heart,         color: '#EF4444', Component: HealthSection    },
  { id: 'suppliers', label: 'Supplier Analysis',  icon: Truck,         color: '#22C55E', Component: SupplierSection  },
  { id: 'festival',  label: 'Festival Demand',    icon: CalendarDays,  color: '#F59E0B', Component: FestivalSection  },
]

export function AdvancedTab() {
  const [section, setSection] = useState('forecast')
  const active = ADVANCED_SECTIONS.find(s => s.id === section)

  return (
    <div className="space-y-5">
      {/* Sub-navigation */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {ADVANCED_SECTIONS.map(sec => {
          const Icon  = sec.icon
          const isOn  = sec.id === section
          return (
            <button
              key={sec.id}
              onClick={() => setSection(sec.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '9px', cursor: 'pointer',
                fontSize: '13px', fontWeight: isOn ? 700 : 500,
                background: isOn ? `${sec.color}14` : 'var(--surface-card)',
                color: isOn ? sec.color : 'var(--text-muted)',
                border: isOn ? `1.5px solid ${sec.color}60` : '1.5px solid var(--border)',
                transition: 'all 0.15s',
              }}
            >
              <Icon size={14} />
              {sec.label}
            </button>
          )
        })}
      </div>

      {/* Section content */}
      {active && <active.Component />}
    </div>
  )
}
