import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FlaskConical, Play, Trash2, RefreshCw, Calendar,
  BarChart2, TrendingUp, Package, AlertTriangle, CheckCircle,
  Database, ShoppingCart, Truck,
} from 'lucide-react'
import axiosInstance from '@/api/axiosInstance'
import { Button } from '@/components/common/Button'
import { TrainingProgress } from '@/components/common/TrainingProgress'
import { PageHeader } from '@/components/common/PageHeader'
import { useToast } from '@/hooks/useToast'
import { formatNumber, formatRs } from '@/utils'

// ── Service calls ─────────────────────────────────────────────────────────────

const syntheticApi = {
  status:   ()     => axiosInstance.get('/synthetic/status'),
  generate: (body) => axiosInstance.post('/synthetic/generate', body),
  clear:    ()     => axiosInstance.delete('/synthetic/clear'),
}

// ── Category definitions ──────────────────────────────────────────────────────

const CATEGORIES = [
  { name: 'Grains & Rice',       icon: '🌾', color: '#F59E0B', count: 5  },
  { name: 'Lentils & Pulses',    icon: '🫘', color: '#10B981', count: 6  },
  { name: 'Oils & Fats',         icon: '🫙', color: '#EF4444', count: 5  },
  { name: 'Spices & Condiments', icon: '🌶️', color: '#F97316', count: 8  },
  { name: 'Sugar & Sweeteners',  icon: '🍬', color: '#EC4899', count: 3  },
  { name: 'Flour & Cereals',     icon: '🌽', color: '#84CC16', count: 4  },
  { name: 'Packaged Foods',      icon: '🍜', color: '#6366F1', count: 6  },
  { name: 'Beverages',           icon: '🍵', color: '#0EA5E9', count: 4  },
  { name: 'Dairy Products',      icon: '🥛', color: '#8B5CF6', count: 4  },
  { name: 'Household & Cleaning',icon: '🧴', color: '#14B8A6', count: 5  },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className={`text-[13px] font-semibold ${mono ? 'font-mono' : ''}`} style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="rounded-xl p-4 flex items-center gap-3"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
      <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${color}18` }}>
        <Icon style={{ width: 16, height: 16, color }} />
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-[18px] font-bold num" style={{ color: 'var(--text-primary)' }}>{value}</p>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SyntheticDataPage() {
  const qc = useQueryClient()
  const { toast } = useToast()

  const [years,          setYears]          = useState(3)
  const [replaceExisting,setReplaceExisting] = useState(false)
  const [randomSeed,     setRandomSeed]      = useState('')
  const [lastResult,     setLastResult]      = useState(null)
  const [confirmClear,   setConfirmClear]    = useState(false)
  const [connected,      setConnected]       = useState(false)

  // Status query
  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['synthetic-status'],
    queryFn:  () => syntheticApi.status().then(r => r.data),
    staleTime: 10_000,
    enabled: connected,
  })
  const status = statusData

  // Generate mutation
  const generateMut = useMutation({
    mutationFn: (body) => syntheticApi.generate(body),
    onSuccess: (res) => {
      setLastResult(res.data)
      qc.invalidateQueries({ queryKey: ['synthetic-status'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      toast({
        title: 'Data generated successfully',
        description: `${formatNumber(res.data.records_generated)} sale records across 50 products.`,
        variant: 'success',
      })
    },
    onError: (e) => toast({
      title: 'Generation failed',
      description: e.response?.data?.message ?? e.message,
      variant: 'error',
    }),
  })

  // Clear mutation
  const clearMut = useMutation({
    mutationFn: () => syntheticApi.clear(),
    onSuccess: (res) => {
      setConfirmClear(false)
      setLastResult(null)
      qc.invalidateQueries({ queryKey: ['synthetic-status'] })
      toast({ title: `Cleared ${formatNumber(res.data.deleted)} records`, variant: 'success' })
    },
    onError: (e) => toast({ title: 'Clear failed', description: e.response?.data?.message, variant: 'error' }),
  })

  const handleGenerate = () => {
    generateMut.mutate({
      years,
      replace_existing: replaceExisting,
      random_seed: randomSeed ? parseInt(randomSeed, 10) : undefined,
    })
  }

  // Disconnected splash
  if (!connected) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="h-16 w-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,.1)' }}>
        <FlaskConical className="h-8 w-8" style={{ color: '#8B5CF6' }} />
      </div>
      <h2 className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>Synthetic Data Generator</h2>
      <p className="text-[13px] text-center max-w-sm" style={{ color: 'var(--text-muted)' }}>
        Generate 200,000+ realistic wholesale grocery sales records across 50 products and 10 categories
        with Nepal-specific seasonal and festival demand patterns for ML model training.
      </p>
      <button onClick={() => setConnected(true)}
        className="px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white"
        style={{ background: '#7C3AED' }}>
        Open Generator
      </button>
    </div>
  )

  return (
    <div className="space-y-6 pb-6">
      <PageHeader
        icon={Database}
        eyebrow="Administration"
        title="Synthetic Data Generator"
        subtitle="Generate 200,000+ wholesale grocery records with 30+ ML features — Nepal festival & seasonal patterns included."
        actions={
          <Button variant="outline" size="sm" icon={RefreshCw} onClick={refetchStatus} loading={statusLoading}>
            Refresh Status
          </Button>
        }
      />

      {/* Status card */}
      <div>
        <div className="rounded-xl p-5"
          style={{
            background: 'var(--surface-card)',
            border: `1px solid ${status?.has_synthetic_data ? 'rgba(34,197,94,.3)' : 'var(--border)'}`,
          }}>
          <div className="flex items-center gap-3 mb-4">
            {status?.has_synthetic_data
              ? <CheckCircle className="h-5 w-5" style={{ color: '#22C55E' }} />
              : <AlertTriangle className="h-5 w-5" style={{ color: '#F59E0B' }} />}
            <h2 className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>
              {statusLoading ? 'Checking status…' : status?.has_synthetic_data
                ? 'Synthetic data is present in database'
                : 'No synthetic data — database is empty'}
            </h2>
            {status?.has_synthetic_data && (
              <span className="ml-auto text-[12px] font-semibold px-2.5 py-0.5 rounded-full"
                style={{ background: 'rgba(34,197,94,.12)', color: '#22C55E' }}>
                {formatNumber(status.total_records)} records
              </span>
            )}
          </div>

          {status?.has_synthetic_data && (
            <div className="space-y-0">
              <InfoRow label="Date Range" value={`${status.date_range_from} → ${status.date_range_to}`} />
              <InfoRow label="Categories" value={status.products?.join(', ') ?? '—'} />
              <InfoRow label="Total Sale Line Items" value={formatNumber(status.total_records)} mono />
            </div>
          )}

          {status?.has_synthetic_data && (
            <div className="mt-4 pt-4 flex justify-end" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              {!confirmClear ? (
                <button onClick={() => setConfirmClear(true)}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                  style={{ color: '#EF4444', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)' }}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear All Synthetic Data
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-[12px]" style={{ color: '#EF4444' }}>This will delete all synthetic records. Are you sure?</span>
                  <button onClick={() => setConfirmClear(false)}
                    className="text-[12px] px-3 py-1.5 rounded-lg"
                    style={{ color: 'var(--text-muted)', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                    Cancel
                  </button>
                  <button onClick={() => clearMut.mutate()} disabled={clearMut.isPending}
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-lg text-white"
                    style={{ background: '#EF4444', opacity: clearMut.isPending ? .6 : 1 }}>
                    {clearMut.isPending ? 'Deleting…' : 'Yes, delete all'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Generator panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Config */}
        <div>
          <div className="rounded-xl overflow-hidden h-full"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <h3 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>Configuration</h3>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                All 50 products across 10 categories are always generated
              </p>
            </div>
            <div className="p-5 space-y-5">

              {/* Years slider */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    Years of History
                  </label>
                  <span className="text-[16px] font-bold num" style={{ color: '#8B5CF6' }}>{years}</span>
                </div>
                <input type="range" min={2} max={5} step={1} value={years}
                  onChange={e => setYears(Number(e.target.value))}
                  className="w-full accent-purple-500" />
                <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  <span>2 yrs (~150K)</span><span>3 yrs (~210K)</span><span>4 yrs (~290K)</span><span>5 yrs (~370K)</span>
                </div>
              </div>

              {/* Options */}
              <div className="space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>Replace Existing Data</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Delete current synthetic records before generating</p>
                  </div>
                  <button type="button" role="switch" aria-checked={replaceExisting}
                    onClick={() => setReplaceExisting(v => !v)}
                    className="relative h-6 w-11 rounded-full transition-colors shrink-0"
                    style={{ background: replaceExisting ? '#8B5CF6' : 'var(--surface-muted)', border: '1.5px solid var(--border)' }}>
                    <span className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
                      style={{ transform: replaceExisting ? 'translateX(20px)' : 'translateX(0)' }} />
                  </button>
                </label>

                <div>
                  <label className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    Random Seed (optional)
                  </label>
                  <input type="number" value={randomSeed} onChange={e => setRandomSeed(e.target.value)}
                    placeholder="e.g. 42 — for reproducible output"
                    className="mt-1.5 w-full text-[13px] px-3 py-2.5 rounded-lg outline-none"
                    style={{ background: 'var(--surface-input)', border: '1.5px solid var(--border)', color: 'var(--text-primary)' }} />
                </div>
              </div>

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={generateMut.isPending}
                className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-semibold text-[14px] text-white transition-opacity"
                style={{ background: '#7C3AED', opacity: generateMut.isPending ? .6 : 1 }}>
                {generateMut.isPending
                  ? <><RefreshCw className="h-4 w-4 animate-spin" /> Generating — this may take 1–2 minutes…</>
                  : <><Play className="h-4 w-4" /> Generate {years} Year{years > 1 ? 's' : ''} of Data</>}
              </button>

              {generateMut.isPending && (
                <div className="space-y-2">
                  <p className="text-[11px] text-center" style={{ color: 'var(--text-muted)' }}>
                    Building 50 products, inserting 200K+ records into MongoDB. Please wait.
                  </p>
                  <div className="flex justify-center">
                    <TrainingProgress
                      active
                      steps={['Generating products', 'Simulating sales', 'Writing to MongoDB', 'Finalizing']}
                      stepDurationMs={20_000}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right panel: what gets generated + result */}
        <div className="space-y-5">

          {/* Category grid */}
          <div className="rounded-xl p-5" style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
            <h3 className="text-[13px] font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
              50 Products · 10 Categories · 15 Suppliers
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map(cat => (
                <div key={cat.name}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ background: `${cat.color}0D`, border: `1px solid ${cat.color}22` }}>
                  <span className="text-[15px]">{cat.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{cat.name}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{cat.count} products</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ML features summary */}
            <div className="mt-4 pt-4 space-y-1.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
                ML Training Features (30+)
              </p>
              {[
                { color: '#2563EB', text: 'Date features — year, month, day, week, quarter, is_weekend' },
                { color: '#F59E0B', text: 'Nepal calendar — Dashain, Tihar, Holi, Teej, Chhath, 8+ festivals' },
                { color: '#10B981', text: 'Seasonal — monsoon dip (Jul–Sep), festival surge (Oct–Nov)' },
                { color: '#8B5CF6', text: 'Product features — category, unit, buying/selling price, margins' },
                { color: '#EF4444', text: 'Stock context — stock_before, stock_after, reorder_level' },
                { color: '#EC4899', text: 'Transaction — payment method, customer type, discount, invoice size' },
              ].map(({ color, text }) => (
                <div key={text} className="flex items-start gap-2">
                  <div className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: color }} />
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Result card */}
          {lastResult && (
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: '1px solid rgba(34,197,94,.3)', background: 'var(--surface-card)' }}>
                <div className="px-5 py-4 flex items-center gap-2"
                  style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(34,197,94,.04)' }}>
                  <CheckCircle className="h-4 w-4" style={{ color: '#22C55E' }} />
                  <h3 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>Generation Complete</h3>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard icon={Database}     label="Sale Records"    value={formatNumber(lastResult.records_generated)} color="#22C55E" />
                    <StatCard icon={TrendingUp}   label="Total Revenue"   value={formatRs(lastResult.total_revenue)} color="#2563EB" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard icon={Calendar}     label="Festival Items"  value={formatNumber(lastResult.festival_records)} color="#F59E0B" />
                    <StatCard icon={Package}      label="Products"        value={lastResult.products?.length ?? 50} color="#8B5CF6" />
                  </div>

                  <div className="text-[12px] py-2 px-3 rounded-lg" style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Range: </span>
                    {lastResult.date_range_from} → {lastResult.date_range_to}
                  </div>

                  {lastResult.training_data_path && (
                    <div className="text-[11px] py-2.5 px-3 rounded-lg space-y-1"
                      style={{ background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)' }}>
                      <div className="flex items-center gap-1.5">
                        <Database className="h-3 w-3 shrink-0" style={{ color: '#22C55E' }} />
                        <span className="font-semibold" style={{ color: '#22C55E' }}>
                          CSV saved — {lastResult.training_data_size_mb} MB
                        </span>
                      </div>
                      <details>
                        <summary className="text-[10px] cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                          Technical details
                        </summary>
                        <p className="font-mono text-[10px] break-all mt-1" style={{ color: 'var(--text-muted)' }}>
                          {lastResult.training_data_path}
                        </p>
                      </details>
                    </div>
                  )}

                  {/* Top 10 products by records */}
                  {lastResult.products?.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
                        Top Products by Records
                      </p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {lastResult.products.slice(0, 15).map(p => {
                          const cat = CATEGORIES.find(c =>
                            p.name.toLowerCase().includes(c.name.split(' ')[0].toLowerCase())
                          )
                          return (
                            <div key={p.name} className="flex items-center gap-3 py-1.5 px-3 rounded-lg"
                              style={{ background: 'var(--surface-muted)' }}>
                              <span className="text-[14px]">{cat?.icon ?? '📦'}</span>
                              <span className="flex-1 text-[11px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                {p.name}
                              </span>
                              <span className="text-[11px] num shrink-0" style={{ color: 'var(--text-muted)' }}>
                                {formatNumber(p.records_generated)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  )
}
