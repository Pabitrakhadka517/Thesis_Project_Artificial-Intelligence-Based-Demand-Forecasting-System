import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  TrendingUp, Play, RefreshCw, Brain, BarChart2,
  Database, AlertCircle, CheckCircle2,
} from 'lucide-react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { mlForecastService } from '@/services/mlForecastService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { SkeletonCard, SkeletonTable } from '@/components/common/Skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { TrainingProgress } from '@/components/common/TrainingProgress'
import { PageHeader } from '@/components/common/PageHeader'
import { useToast } from '@/hooks/useToast'

// ── constants ──────────────────────────────────────────────────────────────────
const MODEL_OPTIONS = [
  { value: '', label: 'Auto (Best Model)' },
  { value: 'random_forest', label: 'Random Forest' },
  { value: 'xgboost',       label: 'XGBoost' },
  { value: 'lstm',          label: 'LSTM Neural Net' },
]
const HORIZON_OPTIONS = [7, 14, 30, 60, 90]
const MODEL_COLORS = { random_forest: '#22C55E', xgboost: '#2563EB', lstm: '#8B5CF6' }
const MODEL_LABELS = { random_forest: 'Random Forest', xgboost: 'XGBoost', lstm: 'LSTM Neural Net' }

// ── helpers ────────────────────────────────────────────────────────────────────
function smartRound(val) {
  if (val == null) return null
  const frac = val - Math.floor(val)
  return frac >= 0.4 ? Math.ceil(val) : Math.floor(val)
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// Derive user-friendly accuracy from mape
function mapeToAccuracy(mape) {
  if (mape == null) return null
  return Math.max(0, Math.round(100 - mape))
}

// ── Custom tooltip for chart ───────────────────────────────────────────────────
// Can't use the shared ChartTooltip directly — it renders every series in
// payload, and this chart carries two invisible confidence-band Areas
// (upper_bound/lower_bound) alongside the two visible lines that need to
// stay out of the tooltip. Styling kept in lockstep with the shared
// components/charts/ChartTooltip.jsx instead.
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const actual = payload.find(p => p.dataKey === 'actual_qty')
  const pred   = payload.find(p => p.dataKey === 'predicted_qty')
  return (
    <div style={{
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      padding: '10px 14px',
      boxShadow: 'var(--shadow-lg)',
      fontSize: '12px',
      minWidth: '150px',
    }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: '8px', fontSize: '11px', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
        {label}
      </p>
      {actual?.value != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: pred?.value != null ? '4px' : 0 }}>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-success)', flexShrink: 0 }} />
          <span style={{ color: 'var(--text-secondary)', flex: 1 }}>Actual</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{smartRound(actual.value)} units</span>
        </div>
      )}
      {pred?.value != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--brand-blue)', flexShrink: 0 }} />
          <span style={{ color: 'var(--text-secondary)', flex: 1 }}>Forecast</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{smartRound(pred.value)} units</span>
        </div>
      )}
    </div>
  )
}

// ── Model comparison table ─────────────────────────────────────────────────────
function CompareTable({ data }) {
  if (!data?.comparison) return null
  const rows = data.comparison

  // Sort: best first, then by accuracy descending
  const sorted = [...rows].sort((a, b) => {
    if (a.is_best) return -1
    if (b.is_best) return 1
    return (a.mape ?? 999) - (b.mape ?? 999)
  })

  return (
    <div className="overflow-x-auto">
      <table className="table-enterprise">
        <thead>
          <tr>
            <th>Model</th>
            <th>Accuracy</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => {
            const color    = MODEL_COLORS[row.model] || '#94A3B8'
            const label    = MODEL_LABELS[row.model] || row.model
            const accuracy = mapeToAccuracy(row.mape)
            const accColor = accuracy >= 70 ? '#22C55E' : accuracy >= 50 ? '#F59E0B' : '#EF4444'
            return (
              <tr key={row.model}>
                <td>
                  <span className="text-[12px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
                    {label}
                  </span>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
                      <div className="h-full rounded-full" style={{ width: `${accuracy}%`, background: accColor }} />
                    </div>
                    <span className="font-bold text-[13px] num" style={{ color: accColor }}>
                      {accuracy != null ? `${accuracy}%` : '—'}
                    </span>
                  </div>
                </td>
                <td>
                  {row.is_best
                    ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(34,197,94,.12)', color: '#22C55E', border: '1px solid rgba(34,197,94,.25)' }}>
                        Best match
                      </span>
                    : <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Dataset summary tab ────────────────────────────────────────────────────────
function DatasetTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['ml-dataset-summary'],
    queryFn:  () => mlForecastService.datasetSummary().then(r => r.data?.data),
    staleTime: 60 * 60_000,
  })

  if (isLoading) return <div className="grid grid-cols-2 md:grid-cols-4 gap-4"><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
  if (!data) return null

  const stats = [
    { label: 'Total Transactions', value: data.total_rows?.toLocaleString() },
    { label: 'Unique SKUs',        value: data.unique_skus },
    { label: 'Dataset Start',      value: data.date_range?.start },
    { label: 'Dataset End',        value: data.date_range?.end },
    { label: 'Days Covered',       value: data.date_range?.days?.toLocaleString() },
    { label: 'Mean Qty / Txn',     value: data.quantity_stats?.mean },
    { label: 'Max Qty / Txn',      value: data.quantity_stats?.max },
    { label: 'Festival Events',    value: data.festivals?.length },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <p className="text-[10px] uppercase font-semibold tracking-wide" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            <p className="text-[18px] font-bold num mt-1" style={{ color: 'var(--text-primary)' }}>{s.value ?? '—'}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Category Breakdown</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="table-enterprise">
              <thead><tr><th>Category</th><th>Total Qty Sold</th><th>Transactions</th></tr></thead>
              <tbody>
                {(data.categories || []).map(c => (
                  <tr key={c.category}>
                    <td className="font-medium">{c.category}</td>
                    <td className="num">{c.total_quantity?.toLocaleString()}</td>
                    <td className="num">{c.transactions?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-3">
          <p className="text-[12px] font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Nepal Festivals Modelled</p>
          <div className="flex flex-wrap gap-2">
            {(data.festivals || []).filter(f => f !== 'none').map(f => (
              <span key={f} className="text-[11px] px-2.5 py-1 rounded-full font-medium capitalize"
                style={{ background: 'rgba(139,92,246,.1)', color: '#8B5CF6', border: '1px solid rgba(139,92,246,.2)' }}>
                {f.replace('_', ' ')}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ForecastingPage() {
  const { toast } = useToast()
  const [tab,          setTab]         = useState('forecast')
  const [selectedSku,  setSelectedSku] = useState('')
  const [horizon,      setHorizon]     = useState(30)
  const [model,        setModel]       = useState('')
  const [result,       setResult]      = useState(null)
  const [resultSku,    setResultSku]   = useState(null)
  const [compareData,  setCompareData] = useState(null)
  const [autoTraining, setAutoTraining] = useState(false)

  // ── Load SKU list ────────────────────────────────────────────────────────
  const { data: skuData, isLoading: skuLoading } = useQuery({
    queryKey: ['ml-skus'],
    queryFn:  () => mlForecastService.listSkus().then(r => r.data?.data || []),
    staleTime: 30 * 60_000,
  })
  const skus = skuData || []
  const liveEligible   = skus.filter(s => s.source === 'live' && s.eligible !== false)
  const liveIneligible = skus.filter(s => s.source === 'live' && s.eligible === false)
  const demoSkus       = skus.filter(s => s.source !== 'live')

  // ── Run forecast mutation ────────────────────────────────────────────────
  // Note: `sku`/`horizonArg`/`modelArg` are passed explicitly via `.mutate(...)`
  // rather than closed over, so a SKU switch mid-flight can't mislabel results.
  const forecastMut = useMutation({
    mutationFn: async ({ sku, horizonArg, modelArg }) => {
      try {
        await mlForecastService.getModel(sku)
      } catch {
        setAutoTraining(true)
        await mlForecastService.trainSku(sku)
        setAutoTraining(false)
      }
      return mlForecastService.runForecast(sku, horizonArg, modelArg || null)
    },
    onSuccess: (res, { sku }) => {
      setAutoTraining(false)
      const data = res.data?.data
      setResult(data)
      setResultSku(sku)
      toast({ title: `Forecast ready — ${data?.confidence_score}% confidence`, variant: 'success' })
      mlForecastService.compareModels(sku)
        .then(r => setCompareData(r.data?.data))
        .catch(() => {})
    },
    onError: (e) => {
      setAutoTraining(false)
      toast({ title: 'Forecast failed', description: e.response?.data?.detail || e.message, variant: 'error' })
    },
  })

  // ── Train + forecast mutation ────────────────────────────────────────────
  const trainMut = useMutation({
    mutationFn: async ({ sku, horizonArg, modelArg }) => {
      await mlForecastService.trainSku(sku)
      return mlForecastService.runForecast(sku, horizonArg, modelArg || null)
    },
    onSuccess: (res, { sku }) => {
      const data = res.data?.data
      setResult(data)
      setResultSku(sku)
      toast({ title: 'Training complete — forecast generated', variant: 'success' })
      mlForecastService.compareModels(sku)
        .then(r => setCompareData(r.data?.data))
        .catch(() => {})
    },
    onError: (e) => {
      toast({ title: 'Training failed', description: e.response?.data?.detail || e.message, variant: 'error' })
    },
  })

  const loading = forecastMut.isPending || trainMut.isPending

  // ── Filter predictions to today and future only ──────────────────────────
  const today = todayStr()
  const futurePredictions = (result?.predictions || []).filter(p => p.date >= today)

  // ── Historical actuals (so the chart shows trend context, not just the
  // future in isolation) ───────────────────────────────────────────────────
  const { data: historyData } = useQuery({
    queryKey: ['ml-history', resultSku],
    queryFn: () => mlForecastService.getHistory(resultSku, 60).then(r => r.data?.data || []),
    enabled: !!resultSku && !!result,
    staleTime: 5 * 60_000,
  })
  const history = historyData || []

  // ── Chart data — historical actuals followed by the forecast, with the
  // last actual point duplicated onto predicted_qty so the two lines join
  // instead of leaving a visual gap. ───────────────────────────────────────
  const historyPoints = history.map(h => ({ date: h.date, actual_qty: smartRound(h.qty) }))
  const lastActual = historyPoints[historyPoints.length - 1]
  const bridgePoint = lastActual ? [{ ...lastActual, predicted_qty: lastActual.actual_qty }] : []
  const futurePoints = futurePredictions.map(p => ({
    date:          p.date,
    predicted_qty: smartRound(p.predicted_qty),
    lower_bound:   p.lower_bound,
    upper_bound:   p.upper_bound,
  }))
  const chartData = [...historyPoints.slice(0, -1), ...bridgePoint, ...futurePoints]

  const inv = result?.inventory || {}

  const TABS = [
    { key: 'forecast', label: 'Demand Forecast', icon: TrendingUp },
    { key: 'dataset',  label: 'Dataset Overview', icon: Database   },
  ]

  // ── Confidence label ─────────────────────────────────────────────────────
  const confScore  = result?.confidence_score ?? 0
  const confLabel  = confScore >= 70 ? 'High' : confScore >= 50 ? 'Moderate' : 'Low'
  const confColor  = confScore >= 70 ? '#22C55E' : confScore >= 50 ? '#F59E0B' : '#EF4444'

  return (
    <div className="space-y-5 pb-6 page-enter">
      <PageHeader
        icon={TrendingUp}
        eyebrow="Operations"
        title="AI Demand Forecasting"
        subtitle="Powered by three AI models — automatically selects the best fit for each product"
      />

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        {TABS.map(t => {
          const Icon   = t.icon
          const active = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all"
              style={{
                background: active ? 'var(--surface-card)' : 'transparent',
                color:      active ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow:  active ? 'var(--shadow-xs)'    : 'none',
              }}>
              <Icon style={{ width: 13, height: 13 }} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Dataset tab ── */}
      {tab === 'dataset' && <DatasetTab />}

      {/* ── Forecast tab ── */}
      {tab === 'forecast' && (
        <div className="space-y-5">

          {/* Controls */}
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-wrap gap-3 items-end">
                {/* SKU selector */}
                <div className="flex flex-col gap-1 flex-1 min-w-50">
                  <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    Product (SKU)
                  </label>
                  <select
                    value={selectedSku}
                    disabled={loading}
                    onChange={e => { setSelectedSku(e.target.value); setResult(null); setResultSku(null); setCompareData(null) }}
                    className="text-[13px] px-3 py-2 rounded-lg outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ background: 'var(--surface-input)', border: '1.5px solid var(--border)', color: 'var(--text-primary)' }}>
                    <option value="">— Select a product —</option>
                    {skuLoading ? (
                      <option disabled>Loading…</option>
                    ) : (
                      <>
                        {(liveEligible.length > 0 || liveIneligible.length > 0) && (
                          <optgroup label="Your Inventory (live sales data)">
                            {liveEligible.map(s => (
                              <option key={s.product_sku} value={s.product_sku}>
                                {s.product_name} ({s.product_sku})
                              </option>
                            ))}
                            {liveIneligible.map(s => (
                              <option key={s.product_sku} value={s.product_sku} disabled>
                                {s.product_name} — needs {s.days_needed} more day{s.days_needed === 1 ? '' : 's'} of sales data
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Demo Dataset (50 sample products)">
                          {demoSkus.map(s => <option key={s.product_sku} value={s.product_sku}>{s.product_name} ({s.product_sku})</option>)}
                        </optgroup>
                      </>
                    )}
                  </select>
                </div>

                {/* Horizon */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    Horizon (days)
                  </label>
                  <select
                    value={horizon}
                    onChange={e => setHorizon(Number(e.target.value))}
                    className="text-[13px] px-3 py-2 rounded-lg outline-none"
                    style={{ background: 'var(--surface-input)', border: '1.5px solid var(--border)', color: 'var(--text-primary)' }}>
                    {HORIZON_OPTIONS.map(h => <option key={h} value={h}>{h} days</option>)}
                  </select>
                </div>

                {/* Model override */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    Model
                  </label>
                  <select
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    className="text-[13px] px-3 py-2 rounded-lg outline-none"
                    style={{ background: 'var(--surface-input)', border: '1.5px solid var(--border)', color: 'var(--text-primary)' }}>
                    {MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <Button
                    icon={loading ? RefreshCw : Play}
                    loading={forecastMut.isPending}
                    disabled={!selectedSku || loading}
                    onClick={() => forecastMut.mutate({ sku: selectedSku, horizonArg: horizon, modelArg: model })}
                    variant="outline"
                  >
                    Forecast
                  </Button>
                  <Button
                    icon={loading ? RefreshCw : Brain}
                    loading={trainMut.isPending}
                    disabled={!selectedSku || loading}
                    onClick={() => trainMut.mutate({ sku: selectedSku, horizonArg: horizon, modelArg: model })}
                    style={{ background: 'var(--brand-primary)' }}
                  >
                    Train + Forecast
                  </Button>
                </div>
              </div>

              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-3 space-y-2">
                  <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    {trainMut.isPending
                      ? 'Training AI models… this may take 2–5 minutes.'
                      : autoTraining
                      ? 'No saved model found — training first… this may take 2–5 minutes.'
                      : 'Running forecast…'}
                  </p>
                  <TrainingProgress active={trainMut.isPending || autoTraining} />
                </motion.div>
              )}
            </CardContent>
          </Card>

          {/* Empty state */}
          {!result && !loading && (
            <EmptyState
              icon={TrendingUp}
              title="No forecast yet"
              description="Select a product, then click Forecast (uses saved model) or Train + Forecast (retrains first)."
              iconColor="#2563EB"
              iconBg="rgba(37,99,235,.08)"
            />
          )}

          {/* Results */}
          {result && (
            <div className="space-y-5">

              {/* Banner */}
              <div className="rounded-xl p-4 flex flex-wrap items-center gap-4"
                style={{ background: 'rgba(37,99,235,.06)', border: '1px solid rgba(37,99,235,.2)' }}>
                <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: '#2563EB' }} />
                <div className="flex-1">
                  <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Forecast generated · {horizon}-day horizon · {futurePredictions.length} upcoming days
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Last trained: {result.trained_at?.slice(0, 10)} · Prediction confidence: {confLabel}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
                    <div className="h-full rounded-full" style={{ width: `${confScore}%`, background: confColor }} />
                  </div>
                  <span className="text-[12px] font-bold" style={{ color: confColor }}>{confLabel}</span>
                </div>
              </div>

              {/* Forecast chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Demand Forecast — Last 60 Days + Next {horizon} Days</CardTitle>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Solid line = actual history · dashed line = forecast · shaded area = confidence interval
                  </p>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                        tickFormatter={v => v?.slice(5)}
                        interval={Math.floor(chartData.length / 8)}
                      />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={60} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area dataKey="upper_bound" stroke="transparent" fill="var(--tint-primary)" name="Upper bound" legendType="none" />
                      <Area dataKey="lower_bound" stroke="transparent" fill="var(--surface-card)" fillOpacity={1} name="Lower bound" legendType="none" />
                      <Line type="monotone" dataKey="actual_qty" stroke="var(--color-success)" strokeWidth={2} dot={false} name="Actual" connectNulls={false} />
                      <Line type="monotone" dataKey="predicted_qty" stroke="var(--brand-blue)" strokeWidth={2} strokeDasharray="5 3" dot={false} name="Forecast" connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Model comparison */}
              {compareData && (
                <Card>
                  <CardHeader>
                    <CardTitle>Model Comparison — {resultSku}</CardTitle>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      All three AI models evaluated — best match selected automatically
                    </p>
                  </CardHeader>
                  <CardContent className="p-0">
                    <CompareTable data={compareData} />
                  </CardContent>
                </Card>
              )}

              {/* Inventory snapshot */}
              {inv.safety_stock != null && (
                <Card>
                  <CardHeader><CardTitle>Inventory Snapshot</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {[
                        { label: 'Daily Demand',    value: `${inv.daily_demand?.toFixed(1)} u/day`,
                          color: 'var(--text-primary)' },
                        { label: 'Safety Stock',    value: `${inv.safety_stock} units`,
                          color: 'var(--text-primary)' },
                        { label: 'Reorder Point',   value: `${inv.reorder_point} units`,
                          color: 'var(--text-primary)' },
                        { label: 'Suggested Order', value: inv.suggested_purchase ? `${inv.suggested_purchase} units` : 'Not needed',
                          color: inv.suggested_purchase ? '#F59E0B' : '#22C55E' },
                        { label: 'Days of Stock',   value: `${inv.days_of_stock} days`,
                          color: inv.days_of_stock < 7 ? '#EF4444' : inv.days_of_stock < 14 ? '#F59E0B' : '#22C55E' },
                        { label: 'Stockout Risk',   value: inv.stockout_risk?.toUpperCase(),
                          color: inv.stockout_risk === 'high' ? '#EF4444' : inv.stockout_risk === 'medium' ? '#F59E0B' : '#22C55E' },
                      ].map(m => (
                        <div key={m.label} className="rounded-xl p-4" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                          <p className="text-[10px] uppercase font-semibold tracking-wide" style={{ color: 'var(--text-muted)' }}>{m.label}</p>
                          <p className="text-[18px] font-bold num mt-1" style={{ color: m.color }}>{m.value ?? '—'}</p>
                        </div>
                      ))}
                    </div>
                    {inv.explanation && (
                      <p className="mt-4 text-[12px] leading-relaxed rounded-lg p-3"
                        style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                        {inv.explanation}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Daily predictions table */}
              <Card>
                <CardHeader><CardTitle>Daily Predictions</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-80">
                    <table className="table-enterprise">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Predicted Demand</th>
                          <th>Trend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {futurePredictions.map((p, i) => {
                          const qty  = smartRound(p.predicted_qty)
                          const prev = i > 0 ? smartRound(futurePredictions[i - 1].predicted_qty) : qty
                          const diff = qty - prev
                          const trendColor = diff > 0 ? '#22C55E' : diff < 0 ? '#EF4444' : 'var(--text-muted)'
                          const trendLabel = diff > 0 ? `↑ +${diff}` : diff < 0 ? `↓ ${diff}` : '→ stable'
                          return (
                            <tr key={p.date}>
                              <td className="font-medium">{p.date}</td>
                              <td className="num font-bold" style={{ color: '#2563EB' }}>{qty} units</td>
                              <td>
                                <span className="text-[12px] font-semibold" style={{ color: trendColor }}>{trendLabel}</span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

            </div>
          )}
        </div>
      )}
    </div>
  )
}
