import { useState, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Package, AlertTriangle, CheckCircle2, TrendingUp,
  TrendingDown, Minus, RefreshCw, ShoppingCart, Brain, Sparkles,
  ChevronRight, ChevronDown, Lightbulb,
} from 'lucide-react'
import { mlForecastService } from '@/services/mlForecastService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/common/Card'
import { SkeletonTable } from '@/components/common/Skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/common/Button'
import { AIExplainability } from '@/components/common/AIExplainability'
import { PageHeader } from '@/components/common/PageHeader'
import { useRole } from '@/hooks/useRole'

// ── helpers ────────────────────────────────────────────────────────────────────
const RISK_STYLE = {
  high:   { color: '#EF4444', bg: 'rgba(239,68,68,.1)',   border: 'rgba(239,68,68,.25)'  },
  medium: { color: '#F59E0B', bg: 'rgba(245,158,11,.1)',  border: 'rgba(245,158,11,.25)' },
  low:    { color: '#22C55E', bg: 'rgba(34,197,94,.1)',   border: 'rgba(34,197,94,.25)'  },
}

function RiskBadge({ level }) {
  if (!level) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  const s = RISK_STYLE[level] || RISK_STYLE.low
  return (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full capitalize"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {level}
    </span>
  )
}

function TrendIcon({ trend }) {
  if (trend === 'rising')  return <TrendingUp  className="h-4 w-4 inline" style={{ color: '#22C55E' }} />
  if (trend === 'falling') return <TrendingDown className="h-4 w-4 inline" style={{ color: '#EF4444' }} />
  return <Minus className="h-4 w-4 inline" style={{ color: 'var(--text-muted)' }} />
}

function StatCard({ icon: Icon, label, value, color, bg }) {
  return (
    <div className="rounded-xl p-4 flex items-center gap-4" style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
      <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
        <Icon style={{ width: 18, height: 18, color }} />
      </div>
      <div>
        <p className="text-[22px] font-bold num leading-none" style={{ color: 'var(--text-primary)' }}>{value ?? '—'}</p>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
      </div>
    </div>
  )
}

// ── Reorder alert banner ───────────────────────────────────────────────────────
function ReorderBanner({ data }) {
  const [open, setOpen] = useState(true)
  if (!data?.length || !open) return null
  return (
    <div className="rounded-xl p-4 flex items-start gap-3"
      style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)' }}>
      <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: '#EF4444' }} />
      <div className="flex-1">
        <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          {data.length} product{data.length > 1 ? 's' : ''} need immediate reordering
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {data.slice(0, 4).map(d => d.product_name || d.sku_id).join(' · ')}
          {data.length > 4 ? ` · +${data.length - 4} more` : ''}
        </p>
      </div>
      <button onClick={() => setOpen(false)} className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Dismiss</button>
    </div>
  )
}

// ── Simple markdown renderer (headers + bullets) ───────────────────────────────
function SimpleMarkdown({ text }) {
  if (!text) return null
  const lines = text.split('\n')
  return (
    <div className="space-y-1 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return (
            <p key={i} className="text-[13px] font-bold mt-4 mb-1" style={{ color: 'var(--text-primary)' }}>
              {line.replace('## ', '')}
            </p>
          )
        }
        if (line.startsWith('• ') || line.startsWith('- ')) {
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span style={{ color: '#8B5CF6', flexShrink: 0 }}>•</span>
              <span>{line.replace(/^[•\-]\s/, '')}</span>
            </div>
          )
        }
        if (line.trim() === '') return <div key={i} className="h-1" />
        return <p key={i}>{line}</p>
      })}
    </div>
  )
}

// ── AI Insights panel ──────────────────────────────────────────────────────────
function InsightsPanel() {
  const [result, setResult] = useState(null)

  const insightsMut = useMutation({
    mutationFn: () => mlForecastService.generateInsights().then(r => r.data?.data),
    onSuccess:  (data) => setResult(data),
  })

  const summary = result?.data_summary || {}

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(139,92,246,.12)' }}>
              <Brain style={{ width: 16, height: 16, color: '#8B5CF6' }} />
            </div>
            <div>
              <CardTitle>AI Business Insights</CardTitle>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Powered by Claude · analyses your live inventory recommendations
              </p>
            </div>
          </div>
          <button
            onClick={() => insightsMut.mutate()}
            disabled={insightsMut.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all"
            style={{
              background:  insightsMut.isPending ? 'var(--surface-muted)' : '#7C3AED',
              color:       insightsMut.isPending ? 'var(--text-muted)'    : '#fff',
              border:      '1px solid transparent',
              cursor:      insightsMut.isPending ? 'not-allowed' : 'pointer',
            }}>
            {insightsMut.isPending
              ? <><RefreshCw style={{ width: 13, height: 13 }} className="animate-spin" /> Generating…</>
              : <><Sparkles style={{ width: 13, height: 13 }} /> Generate Insights</>}
          </button>
        </div>
      </CardHeader>

      <CardContent>
        {/* idle state */}
        {!result && !insightsMut.isPending && (
          <div className="flex flex-col items-center justify-center py-10 rounded-xl"
            style={{ background: 'var(--surface-muted)', border: '1px dashed var(--border)' }}>
            <Brain className="h-10 w-10 mb-3" style={{ color: 'rgba(139,92,246,.4)' }} />
            <p className="text-[13px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
              No insights generated yet
            </p>
            <p className="text-[12px] mt-1 text-center max-w-xs" style={{ color: 'var(--text-muted)' }}>
              Click "Generate Insights" to analyse your inventory data with Claude AI
              and get actionable recommendations.
            </p>
          </div>
        )}

        {/* loading */}
        {insightsMut.isPending && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="h-10 w-10 rounded-full border-4 border-purple-500/30 border-t-purple-500 animate-spin" />
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              Claude is analysing your inventory data…
            </p>
          </div>
        )}

        {/* result */}
        {result && !insightsMut.isPending && (
          <div className="space-y-4">

              {/* Data summary chips */}
              {Object.keys(summary).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'SKUs analysed',    value: summary.total_skus },
                    { label: 'Need reorder',      value: summary.needs_reorder,    color: '#F59E0B' },
                    { label: 'High risk',         value: summary.high_risk,        color: '#EF4444' },
                    { label: 'Overstock',         value: summary.overstock,        color: '#8B5CF6' },
                    { label: 'Budget needed',     value: summary.estimated_budget ? `NPR ${Number(summary.estimated_budget).toLocaleString()}` : null },
                  ].filter(c => c.value != null).map(c => (
                    <span key={c.label}
                      className="text-[11px] px-2.5 py-1 rounded-full font-medium"
                      style={{
                        background: c.color ? `${c.color}18` : 'var(--surface-muted)',
                        color:      c.color || 'var(--text-secondary)',
                        border:     `1px solid ${c.color ? c.color + '30' : 'var(--border)'}`,
                      }}>
                      {c.label}: <strong>{c.value}</strong>
                    </span>
                  ))}
                  <span className="text-[11px] px-2.5 py-1 rounded-full"
                    style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    Generated {result.generated_at?.slice(0, 16).replace('T', ' ')} UTC
                  </span>
                </div>
              )}

              {/* Insights text */}
              <div className="rounded-xl p-4"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                <SimpleMarkdown text={result.insights} />
              </div>

              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                AI insights are advisory only. Verify with your supplier lead times and current market conditions.
              </p>
          </div>
        )}

        {/* error */}
        {insightsMut.isError && (
          <div className="rounded-lg p-3 mt-2"
            style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)' }}>
            <p className="text-[12px]" style={{ color: '#EF4444' }}>
              {insightsMut.error?.response?.data?.detail || insightsMut.error?.message || 'Insight generation failed.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function RecommendationsPage() {
  const [riskFilter, setRiskFilter] = useState(null)
  const [expandedSku, setExpandedSku] = useState(null)
  const navigate = useNavigate()
  const { prefix, can } = useRole()

  const createPO = (row) => {
    navigate(`${prefix}/purchases`, {
      state: { presetSku: row.sku_id, presetQty: Math.ceil(row.suggested_purchase) },
    })
  }

  const { data: recs, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['ml-inventory-recs', riskFilter],
    queryFn:  () => mlForecastService.listInventoryRecs(riskFilter).then(r => r.data?.data || []),
    staleTime: 5 * 60_000,
  })

  const { data: alerts } = useQuery({
    queryKey: ['ml-reorder-alerts'],
    queryFn:  () => mlForecastService.reorderAlerts().then(r => r.data?.data || []),
    staleTime: 5 * 60_000,
  })

  const items = recs || []

  // Summary stats
  const total        = items.length
  const needsReorder = items.filter(r => r.needs_reorder).length
  const highRisk     = items.filter(r => r.stockout_risk === 'high').length
  const healthy      = items.filter(r => r.stockout_risk === 'low' && !r.needs_reorder).length

  const RISK_TABS = [
    { key: null,     label: `All (${total})` },
    { key: 'high',   label: `High Risk (${items.filter(r => r.stockout_risk === 'high').length})` },
    { key: 'medium', label: `Medium (${items.filter(r => r.stockout_risk === 'medium').length})` },
    { key: 'low',    label: `Low (${items.filter(r => r.stockout_risk === 'low').length})` },
  ]

  return (
    <div className="space-y-5 pb-6 page-enter">
      <PageHeader
        icon={Lightbulb}
        eyebrow="Operations"
        title="Inventory Recommendations"
        subtitle="AI-powered safety stock · reorder point · EOQ · purchase suggestions"
        actions={
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold"
            style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            <RefreshCw style={{ width: 13, height: 13 }} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      {/* Reorder alert banner */}
      <ReorderBanner data={alerts} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Package}       label="Total Analysed"  value={total}        color="#8B5CF6" bg="rgba(139,92,246,.1)"  />
        <StatCard icon={ShoppingCart}  label="Needs Reorder"   value={needsReorder} color="#F59E0B" bg="rgba(245,158,11,.1)" />
        <StatCard icon={AlertTriangle} label="High Risk"       value={highRisk}     color="#EF4444" bg="rgba(239,68,68,.1)"   />
        <StatCard icon={CheckCircle2}  label="Healthy"         value={healthy}      color="#22C55E" bg="rgba(34,197,94,.1)"   />
      </div>

      {/* AI Insights panel */}
      <InsightsPanel />

      {/* Risk filter tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        {RISK_TABS.map(t => {
          const active = riskFilter === t.key
          return (
            <button key={String(t.key)} onClick={() => setRiskFilter(t.key)}
              className="px-4 py-2 rounded-lg text-[12px] font-semibold transition-all"
              style={{
                background: active ? 'var(--surface-card)' : 'transparent',
                color:      active ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow:  active ? 'var(--shadow-xs)'    : 'none',
              }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Main table */}
      <Card>
        <CardHeader>
          <CardTitle>Product Inventory Recommendations</CardTitle>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Safety stock at 95% service level (Z=1.645) · EOQ = √(2DS/H) · Sorted by stockout probability
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-5"><SkeletonTable rows={8} cols={9} /></div>
          ) : items.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Package}
                title="No recommendations yet"
                description="Run forecasts first via the Demand Forecasting page. Inventory recommendations are generated automatically after each forecast."
                iconColor="#8B5CF6"
                iconBg="rgba(139,92,246,.08)"
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-enterprise">
                <thead>
                  <tr>
                    <th></th>
                    <th>Product</th>
                    <th>Category</th>
                    <th className="text-right">Current Stock</th>
                    <th className="text-right">Daily Demand</th>
                    <th className="text-right">Safety Stock</th>
                    <th className="text-right">Reorder Point</th>
                    <th className="text-right">EOQ</th>
                    <th className="text-right">Suggested Order</th>
                    <th className="text-right">Days of Stock</th>
                    <th className="text-right">Inv. Turnover</th>
                    <th>Stockout Risk</th>
                    <th>Overstock Risk</th>
                    <th>Trend</th>
                    {can('inventory_manager') && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map(row => {
                    const isOpen = expandedSku === row.sku_id
                    return (
                    <Fragment key={row.sku_id}>
                    <tr
                      style={row.needs_reorder ? { background: 'rgba(239,68,68,.03)' } : {}}>
                      <td className="w-8">
                        <button
                          onClick={() => setExpandedSku(isOpen ? null : row.sku_id)}
                          aria-label={isOpen ? 'Hide reasoning' : 'Show reasoning'}
                          title={isOpen ? 'Hide reasoning' : 'Why this recommendation?'}
                          className="icon-btn flex items-center justify-center"
                          style={{ width: 22, height: 22, color: 'var(--text-muted)' }}>
                          {isOpen ? <ChevronDown style={{ width: 14, height: 14 }} /> : <ChevronRight style={{ width: 14, height: 14 }} />}
                        </button>
                      </td>
                      <td>
                        <button onClick={() => setExpandedSku(isOpen ? null : row.sku_id)} className="text-left">
                          <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {row.product_name || row.sku_id}
                          </p>
                          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{row.sku_id}</p>
                        </button>
                      </td>
                      <td className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{row.category || '—'}</td>
                      <td className="num text-right">{row.current_stock?.toLocaleString() ?? '—'}</td>
                      <td className="num text-right">{row.daily_demand?.toFixed(1) ?? '—'}</td>
                      <td className="num text-right font-semibold" style={{ color: '#F59E0B' }}>
                        {row.safety_stock?.toLocaleString() ?? '—'}
                      </td>
                      <td className="num text-right font-semibold" style={{ color: '#8B5CF6' }}>
                        {row.reorder_point?.toLocaleString() ?? '—'}
                      </td>
                      <td className="num text-right">{row.eoq?.toLocaleString() ?? '—'}</td>
                      <td className="text-right">
                        {row.suggested_purchase > 0
                          ? <span className="font-bold num" style={{ color: '#EF4444' }}>
                              {Number(row.suggested_purchase).toLocaleString()}
                            </span>
                          : <span style={{ color: '#22C55E' }}>—</span>}
                      </td>
                      <td className="num text-right">
                        <span style={{ color: row.days_of_stock < 7 ? '#EF4444' : row.days_of_stock < 14 ? '#F59E0B' : 'var(--text-secondary)' }}>
                          {row.days_of_stock === 9999 ? '∞' : row.days_of_stock}
                        </span>
                      </td>
                      <td className="num text-right">{row.inventory_turnover?.toFixed(1) ?? '—'}</td>
                      <td>
                        <div>
                          <RiskBadge level={row.stockout_risk} />
                          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {row.stockout_probability}%
                          </p>
                        </div>
                      </td>
                      <td>
                        <div>
                          <RiskBadge level={row.overstock_risk} />
                          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {row.overstock_probability}%
                          </p>
                        </div>
                      </td>
                      <td><TrendIcon trend={row.demand_trend} /></td>
                      {can('inventory_manager') && (
                        <td>
                          {row.suggested_purchase > 0 && (
                            <Button size="xs" variant="secondary" icon={ShoppingCart} onClick={() => createPO(row)}>
                              Create PO
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={can('inventory_manager') ? 13 : 12} style={{ background: 'var(--surface-muted)', padding: '10px 14px' }}>
                          <AIExplainability
                            currentStock={row.current_stock}
                            forecastDemand={row.forecast_qty ?? (row.daily_demand != null ? row.daily_demand * 30 : null)}
                            dailyDemand={row.daily_demand}
                            leadTimeDays={row.lead_time_days}
                            safetyStock={row.safety_stock}
                            reorderPoint={row.reorder_point}
                            eoq={row.eoq}
                            suggestedPurchase={row.suggested_purchase}
                            reasoning={row.explanation}
                            hasHistoricalData={row.has_historical_data !== false}
                          />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Formula reference */}
      <Card>
        <CardContent className="py-4">
          <p className="text-[12px] font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Formulas Used</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <div className="rounded-lg p-3" style={{ background: 'var(--surface-muted)' }}>
              <p className="font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Safety Stock</p>
              <p className="font-mono">SS = Z × σ_demand × √(lead_time)</p>
              <p className="mt-1">Z = 1.645 (95% service level)</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: 'var(--surface-muted)' }}>
              <p className="font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Reorder Point</p>
              <p className="font-mono">ROP = μ_daily × lead_time + SS</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: 'var(--surface-muted)' }}>
              <p className="font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Economic Order Qty</p>
              <p className="font-mono">EOQ = √(2 × D × S / H)</p>
              <p className="mt-1">S = NPR 500/order · H = 20% of buying price</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
