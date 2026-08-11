import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Cpu, Play, RefreshCw, AlertCircle, CheckCircle2,
  Clock, Brain, Zap, BarChart2, Table2, ChevronUp, ChevronDown,
} from 'lucide-react'
import { mlForecastService } from '@/services/mlForecastService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { SkeletonCard, SkeletonTable } from '@/components/common/Skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { TrainingProgress } from '@/components/common/TrainingProgress'
import { PageHeader } from '@/components/common/PageHeader'
import { useToast } from '@/hooks/useToast'

// ── model definitions (the 3 models actually implemented) ─────────────────────
const MODEL_DEFS = [
  {
    key:   'random_forest',
    label: 'Random Forest',
    color: '#22C55E',
    bg:    'rgba(34,197,94,.1)',
    desc:  'Ensemble of 300 decision trees — high accuracy, resistant to overfitting, fast inference',
    icon:  Brain,
  },
  {
    key:   'xgboost',
    label: 'XGBoost',
    color: '#2563EB',
    bg:    'rgba(37,99,235,.1)',
    desc:  'Gradient-boosted trees (400 estimators) — best overall accuracy for this dataset',
    icon:  Zap,
  },
  {
    key:   'lstm',
    label: 'LSTM Neural Net',
    color: '#8B5CF6',
    bg:    'rgba(139,92,246,.1)',
    desc:  'Long Short-Term Memory (128→64 units, Huber loss) — captures complex seasonal patterns',
    icon:  Cpu,
  },
]

// ── Model card ─────────────────────────────────────────────────────────────────
function ModelCard({ model, trainedMeta, onTrain, isTraining }) {
  const Icon      = model.icon
  const skuMeta   = trainedMeta   // per-model metrics from mlModels collection
  const m         = skuMeta?.metrics?.[model.key] || {}
  const isBest    = skuMeta?.best_model === model.key
  const hasMetrics= m.mape != null

  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: 'var(--surface-card)',
        border: `1px solid var(--border)`,
        borderTop: `3px solid ${model.color}`,
        boxShadow: 'var(--shadow-sm)',
      }}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: model.bg }}>
            <Icon style={{ width: 18, height: 18, color: model.color }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>{model.label}</p>
              {isBest && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(34,197,94,.12)', color: '#22C55E', border: '1px solid rgba(34,197,94,.25)' }}>
                  BEST
                </span>
              )}
            </div>
            <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{model.desc}</p>
          </div>
        </div>
        {hasMetrics ? <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: '#22C55E' }} />
                    : <Clock        className="h-4 w-4 shrink-0" style={{ color: 'var(--text-muted)' }} />}
      </div>

      {hasMetrics && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[
            { label: 'MAE',  value: m.mae?.toFixed(2),  gloss: 'Avg. units off, either way' },
            { label: 'RMSE', value: m.rmse?.toFixed(2), gloss: 'Same, penalizes big misses' },
            { label: 'MAPE', value: m.mape?.toFixed(2) + '%', gloss: 'Avg. % error — lower is better',
              color: m.mape > 30 ? '#EF4444' : m.mape > 15 ? '#F59E0B' : '#22C55E' },
            { label: 'R²',   value: m.r2?.toFixed(4),   gloss: 'Fit quality, 1.0 = perfect' },
          ].map(stat => (
            <div key={stat.label} className="rounded-lg p-2.5" style={{ background: 'var(--surface-muted)' }}>
              <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
              <p className="text-[15px] font-bold num" style={{ color: stat.color || model.color }}>{stat.value ?? '—'}</p>
              <p className="text-[9.5px] mt-0.5 leading-tight" style={{ color: 'var(--text-muted)' }}>{stat.gloss}</p>
            </div>
          ))}
        </div>
      )}

      <Button
        size="sm"
        variant={hasMetrics ? 'secondary' : 'outline'}
        icon={isTraining ? RefreshCw : Play}
        loading={isTraining}
        onClick={onTrain}
        className="w-full justify-center">
        {hasMetrics ? 'Retrain' : 'Train Model'}
      </Button>
    </div>
  )
}

// ── Metrics table (all trained SKUs) ──────────────────────────────────────────
function MetricsTable({ rows }) {
  const [sortKey, setSortKey] = useState('mape_xgboost')
  const [sortDir, setSortDir] = useState('asc')

  if (!rows.length) return (
    <EmptyState
      icon={BarChart2}
      title="No trained models yet"
      description="Train models using the cards above. After training, per-SKU MAE / RMSE / MAPE / R² appear here."
      iconColor="#8B5CF6"
      iconBg="rgba(139,92,246,.08)"
    />
  )

  const toggle = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = [...rows].sort((a, b) => {
    const va = a[sortKey] ?? Infinity; const vb = b[sortKey] ?? Infinity
    return sortDir === 'asc' ? va - vb : vb - va
  })

  const SortIcon = ({ k }) => {
    if (sortKey !== k) return null
    return sortDir === 'asc'
      ? <ChevronUp  style={{ width: 11, height: 11, display: 'inline', marginLeft: 3 }} />
      : <ChevronDown style={{ width: 11, height: 11, display: 'inline', marginLeft: 3 }} />
  }

  const TH = ({ k, title, children }) => (
    <th onClick={() => toggle(k)} title={title} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {children}<SortIcon k={k} />
    </th>
  )

  const mapeColor = (v) => v > 30 ? '#EF4444' : v > 15 ? '#F59E0B' : '#22C55E'

  return (
    <div className="overflow-x-auto">
      <table className="table-enterprise">
        <thead>
          <tr>
            <th>Product (SKU)</th>
            <th>Best Model</th>
            <TH k="mape_rf" title="Random Forest — average % error, lower is better">RF MAPE%</TH>
            <TH k="mape_xgboost" title="XGBoost — average % error, lower is better">XGB MAPE%</TH>
            <TH k="mape_lstm" title="LSTM — average % error, lower is better">LSTM MAPE%</TH>
            <TH k="r2_xgboost" title="Fit quality of the best model, 1.0 = perfect">Best R²</TH>
            <th>Trained</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => (
            <tr key={row.sku_id}>
              <td>
                <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{row.product_name || row.sku_id}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{row.sku_id}</p>
              </td>
              <td>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full capitalize"
                  style={{ background: 'rgba(37,99,235,.1)', color: '#2563EB', border: '1px solid rgba(37,99,235,.2)' }}>
                  {row.best_model?.replace('_', ' ')}
                </span>
              </td>
              <td>
                {row.mape_rf != null
                  ? <span className="font-bold num text-[13px]" style={{ color: mapeColor(row.mape_rf) }}>{row.mape_rf.toFixed(1)}%</span>
                  : <span style={{ color: 'var(--text-muted)' }}>—</span>}
              </td>
              <td>
                {row.mape_xgboost != null
                  ? <span className="font-bold num text-[13px]" style={{ color: mapeColor(row.mape_xgboost) }}>{row.mape_xgboost.toFixed(1)}%</span>
                  : <span style={{ color: 'var(--text-muted)' }}>—</span>}
              </td>
              <td>
                {row.mape_lstm != null
                  ? <span className="font-bold num text-[13px]" style={{ color: mapeColor(row.mape_lstm) }}>{row.mape_lstm.toFixed(1)}%</span>
                  : <span style={{ color: 'var(--text-muted)' }}>—</span>}
              </td>
              <td className="num text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                {row.r2_best?.toFixed(4) ?? '—'}
              </td>
              <td className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {row.trained_at ? new Date(row.trained_at).toLocaleDateString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ModelsPage() {
  const qc = useQueryClient()
  const { toast } = useToast()

  const [tab,          setTab]          = useState('cards')
  const [selectedSku,  setSelectedSku]  = useState('')
  const [trainingKey,  setTrainingKey]  = useState(null)
  const [connected,    setConnected]    = useState(false)

  // ── Load SKU list ────────────────────────────────────────────────────────
  const { data: skus = [] } = useQuery({
    queryKey: ['ml-skus-models'],
    queryFn:  () => mlForecastService.listSkus().then(r => r.data?.data || []),
    staleTime: 30 * 60_000,
    enabled: connected,
  })

  // ── Load trained model metadata for the selected SKU ─────────────────────
  const { data: skuMeta } = useQuery({
    queryKey: ['ml-model-meta', selectedSku],
    queryFn:  () => mlForecastService.getModel(selectedSku).then(r => r.data?.data),
    staleTime: 2 * 60_000,
    enabled: connected && !!selectedSku,
  })

  // ── Load all trained models for the metrics table ────────────────────────
  const { data: allModels = [], isLoading: modelsLoading } = useQuery({
    queryKey: ['ml-all-models'],
    queryFn:  () => mlForecastService.listModels().then(r => {
      const docs = r.data?.data || []
      return docs.map(d => ({
        sku_id:       d.sku_id,
        product_name: d.sku_id,           // name not in mlModels; show SKU
        best_model:   d.best_model,
        mape_rf:      d.metrics?.random_forest?.mape,
        mape_xgboost: d.metrics?.xgboost?.mape,
        mape_lstm:    d.metrics?.lstm?.mape,
        r2_best:      d.metrics?.[d.best_model]?.r2,
        trained_at:   d.trained_at,
      }))
    }),
    staleTime: 2 * 60_000,
    enabled: connected && tab === 'metrics',
  })

  // ── Train one SKU mutation ───────────────────────────────────────────────
  const trainMut = useMutation({
    mutationFn: (skuId) => mlForecastService.trainSku(skuId),
    onSuccess: (res, skuId) => {
      const data = res.data?.data
      toast({
        title: `Training complete — best model: ${data?.best_model?.replace('_', ' ')}`,
        variant: 'success',
      })
      setTrainingKey(null)
      qc.invalidateQueries({ queryKey: ['ml-model-meta', skuId] })
      qc.invalidateQueries({ queryKey: ['ml-all-models'] })
    },
    onError: (e) => {
      toast({ title: 'Training failed', description: e.response?.data?.detail || e.message, variant: 'error' })
      setTrainingKey(null)
    },
  })

  // ── Train all SKUs (background) ──────────────────────────────────────────
  const trainAllMut = useMutation({
    mutationFn: () => mlForecastService.trainAll(selectedSku ? [selectedSku] : null),
    onSuccess: () => {
      toast({ title: 'Training queued in background. Check back in a few minutes.', variant: 'success' })
      setTrainingKey(null)
    },
    onError: (e) => {
      toast({ title: 'Failed to queue training', description: e.message, variant: 'error' })
      setTrainingKey(null)
    },
  })

  const handleTrain = (modelKey) => {
    if (!selectedSku) {
      toast({ title: 'Select a product first', variant: 'error' })
      return
    }
    setTrainingKey(modelKey)
    trainMut.mutate(selectedSku)   // trains all 3 models for that SKU
  }

  const handleTrainAll = () => {
    setTrainingKey('all')
    trainAllMut.mutate()
  }

  const tabs = [
    { key: 'cards',   label: 'Model Cards',   icon: Cpu    },
    { key: 'metrics', label: `Metrics Table${allModels.length ? ` (${allModels.length} SKUs)` : ''}`, icon: Table2 },
  ]

  if (!connected) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="h-16 w-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,.1)' }}>
        <Cpu className="h-8 w-8" style={{ color: '#8B5CF6' }} />
      </div>
      <h2 className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>ML Model Management</h2>
      <p className="text-[13px] text-center max-w-sm" style={{ color: 'var(--text-muted)' }}>
        Train and compare Random Forest, XGBoost, and LSTM models on 3 years of Nepal wholesale grocery data.
        Requires the AI service to be running.
      </p>
      <button onClick={() => setConnected(true)}
        className="px-5 py-2 rounded-lg text-[13px] font-semibold"
        style={{ background: 'rgba(139,92,246,.15)', color: '#8B5CF6', border: '1px solid rgba(139,92,246,.2)' }}>
        Load Model Manager
      </button>
    </div>
  )

  return (
    <div className="space-y-5 pb-6 page-enter">
      <PageHeader
        icon={Cpu}
        eyebrow="Analytics"
        title="Forecasting Models"
        subtitle="Train and monitor Random Forest · XGBoost · LSTM · 39-feature set · auto best-model selection"
        actions={
          <Button
            icon={trainAllMut.isPending ? RefreshCw : Play}
            loading={trainAllMut.isPending}
            onClick={handleTrainAll}
            style={{ background: '#7C3AED' }}>
            {selectedSku ? 'Train Selected SKU' : 'Train All SKUs (Background)'}
          </Button>
        }
      />

      {/* SKU selector */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-[13px] font-medium shrink-0" style={{ color: 'var(--text-secondary)' }}>Train for:</p>
            <select
              value={selectedSku}
              disabled={trainMut.isPending || trainAllMut.isPending}
              onChange={e => setSelectedSku(e.target.value)}
              className="text-[13px] px-3 py-2 rounded-lg outline-none flex-1 max-w-xs disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: 'var(--surface-input)', border: '1.5px solid var(--border)', color: 'var(--text-primary)' }}>
              <option value="">All {skus.length} Dataset SKUs</option>
              {skus.map(s => <option key={s.product_sku} value={s.product_sku}>{s.product_name} ({s.product_sku})</option>)}
            </select>
            {selectedSku && (
              <button onClick={() => setSelectedSku('')} disabled={trainMut.isPending || trainAllMut.isPending}
                className="text-[12px] font-medium disabled:opacity-60 disabled:cursor-not-allowed" style={{ color: '#2563EB' }}>
                Clear
              </button>
            )}
          </div>

          {/* Show trained metadata for selected SKU */}
          {selectedSku && skuMeta && (
            <div
              className="mt-3 flex flex-wrap items-center gap-3 text-[12px]"
              style={{ color: 'var(--text-muted)' }}>
              <CheckCircle2 className="h-3.5 w-3.5" style={{ color: '#22C55E' }} />
              <span>Last trained: {skuMeta.trained_at ? new Date(skuMeta.trained_at).toLocaleString() : '—'}</span>
              <span>·</span>
              <span>Best model: <strong style={{ color: 'var(--text-primary)' }}>{skuMeta.best_model?.replace('_', ' ')}</strong></span>
              <span>·</span>
              <span>MAPE: <strong style={{ color: '#2563EB' }}>{skuMeta.metrics?.[skuMeta.best_model]?.mape?.toFixed(1)}%</strong></span>
            </div>
          )}
        </CardContent>
      </Card>

      {(trainMut.isPending || trainAllMut.isPending) && (
        <Card>
          <CardContent className="py-4">
            <p className="text-[12px] mb-2.5" style={{ color: 'var(--text-muted)' }}>
              {trainAllMut.isPending
                ? 'Training queued for all SKUs in the background — this page will keep working while it runs.'
                : 'Training Random Forest, XGBoost, and LSTM for this SKU — usually 2–5 minutes.'}
            </p>
            <TrainingProgress active={trainMut.isPending} />
          </CardContent>
        </Card>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        {tabs.map(t => {
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

      {/* Model Cards */}
      {tab === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {MODEL_DEFS.map(model => (
            <ModelCard
              key={model.key}
              model={model}
              trainedMeta={selectedSku ? skuMeta : null}
              onTrain={() => handleTrain(model.key)}
              isTraining={trainMut.isPending && trainingKey === model.key}
            />
          ))}
        </div>
      )}

      {/* Metrics Table */}
      {tab === 'metrics' && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Model Evaluation Metrics — All Trained SKUs</CardTitle>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                MAPE: lower = better · green &lt; 15% · amber &lt; 30% · red ≥ 30% · click headers to sort
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { label: 'Good: MAPE < 15%', color: '#22C55E', bg: 'rgba(34,197,94,.1)'  },
                { label: 'Fair: < 30%',      color: '#F59E0B', bg: 'rgba(245,158,11,.1)' },
                { label: 'Poor: ≥ 30%',      color: '#EF4444', bg: 'rgba(239,68,68,.1)'  },
              ].map(b => (
                <span key={b.label} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: b.bg, color: b.color }}>
                  {b.label}
                </span>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {modelsLoading
              ? <div className="p-5"><SkeletonTable rows={8} cols={7} /></div>
              : <MetricsTable rows={allModels} />}
          </CardContent>
        </Card>
      )}

      {/* Info card */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Brain className="h-5 w-5 shrink-0 mt-0.5" style={{ color: '#8B5CF6' }} />
            <div>
              <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>How Model Selection Works</p>
              <p className="text-[12px] mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                All three models are trained on the same 80/20 chronological split per SKU.
                The best model is selected by lowest MAPE on the held-out test set (ties broken by RMSE).
                XGBoost typically wins on most grocery products; LSTM captures complex multi-peak seasonal patterns.
                The 39-feature set includes Nepal festival proximity, lag windows (7–30 days), rolling statistics,
                price elasticity, and annual trend factors derived from 3 years of Kathmandu wholesale data.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
