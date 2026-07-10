import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import {
  Scale, Plus, Search, Edit2, Trash2, RefreshCw,
  Lock, ToggleLeft, ToggleRight,
} from 'lucide-react'
import axiosInstance from '@/api/axiosInstance'
import { Card, CardContent } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { Input } from '@/components/common/Input'
import { Modal, ConfirmDialog } from '@/components/common/Modal'
import { SkeletonTable } from '@/components/common/Skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { Pagination } from '@/components/common/Pagination'
import { useToast } from '@/hooks/useToast'

const UNIT_TYPES = ['weight', 'volume', 'count']

const schema = z.object({
  name:             z.string().min(1, 'Name is required').max(50),
  symbol:           z.string().min(1, 'Symbol is required').max(20),
  unitType:         z.enum(['weight', 'volume', 'count'], { required_error: 'Type is required' }),
  description:      z.string().max(300).optional().or(z.literal('')),
  baseUnit:         z.string().max(50).optional().or(z.literal('')),
  conversionFactor: z.coerce.number().positive().optional().or(z.literal('')),
  isActive:         z.boolean().default(true),
})

const TYPE_CFG = {
  weight: { label: 'Weight', color: '#F59E0B', examples: 'gram, kg' },
  volume: { label: 'Volume', color: '#3B82F6', examples: 'ml, liter' },
  count:  { label: 'Count',  color: '#22C55E', examples: 'piece, packet, carton' },
}

function TypeBadge({ type }) {
  const cfg = TYPE_CFG[type] || { label: type, color: '#94A3B8' }
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: `${cfg.color}18`, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

function Sel({ label, error, children, ...props }) {
  return (
    <div>
      {label && (
        <label className="block text-[12px] font-semibold uppercase tracking-wide mb-1.5"
          style={{ color: 'var(--text-muted)' }}>{label}</label>
      )}
      <select {...props}
        className="w-full text-[13px] px-3 py-2.5 rounded-lg outline-none"
        style={{ background: 'var(--surface-input)', border: `1.5px solid ${error ? '#EF4444' : 'var(--border)'}`, color: 'var(--text-primary)', borderRadius: 8 }}>
        {children}
      </select>
      {error && <p className="text-[11px] mt-1" style={{ color: '#EF4444' }}>{error}</p>}
    </div>
  )
}

function UnitForm({ form, onSubmit, loading, isSystem }) {
  const e = form.formState.errors
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Name *" placeholder="e.g. kilogram"
          error={e.name?.message} {...form.register('name')} disabled={isSystem} />
        <Input label="Symbol *" placeholder="e.g. kg"
          error={e.symbol?.message} {...form.register('symbol')} disabled={isSystem} />
      </div>

      <Sel label="Type *" error={e.unitType?.message} {...form.register('unitType')} disabled={isSystem}>
        <option value="">— Select type —</option>
        {UNIT_TYPES.map(t => <option key={t} value={t}>{TYPE_CFG[t]?.label || t}</option>)}
      </Sel>

      <Input label="Description" placeholder="Brief description"
        error={e.description?.message} {...form.register('description')} />

      <div className="grid grid-cols-2 gap-3">
        <Input label="Base Unit" placeholder="e.g. gram"
          {...form.register('baseUnit')} disabled={isSystem} />
        <Input label="Conversion Factor" type="number" step="any" placeholder="e.g. 1000"
          error={e.conversionFactor?.message} {...form.register('conversionFactor')} disabled={isSystem} />
      </div>

      {isSystem && (
        <p className="text-[12px] px-3 py-2 rounded-lg"
          style={{ background: 'rgba(245,158,11,.08)', color: '#F59E0B', border: '1px solid rgba(245,158,11,.2)' }}>
          System units: only the Active toggle can be changed.
        </p>
      )}

      <label className="flex items-center gap-2.5 cursor-pointer">
        <input type="checkbox" {...form.register('isActive')} className="w-4 h-4 rounded accent-blue-600" />
        <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>Active</span>
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" loading={loading}>Save Unit</Button>
      </div>
    </form>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
      <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-[22px] font-bold num" style={{ color }}>{value ?? '—'}</p>
    </div>
  )
}

export default function UnitsPage() {
  const qc = useQueryClient()
  const { toast } = useToast()

  const [search,     setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page,       setPage]       = useState(1)
  const [pageSize,   setPageSize]   = useState(20)
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editItem,   setEditItem]   = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['units-page', page, pageSize, search, typeFilter],
    queryFn: () => axiosInstance.get('/units', {
      params: { page, limit: pageSize, search: search || undefined, unitType: typeFilter || undefined },
    }).then(r => r.data),
    keepPreviousData: true,
  })

  const { data: statsData } = useQuery({
    queryKey: ['units-stats'],
    queryFn: () => axiosInstance.get('/units/stats').then(r => r.data),
    staleTime: 30_000,
  })

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', symbol: '', unitType: '', description: '', baseUnit: '', conversionFactor: '', isActive: true },
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['units-page'] })
    qc.invalidateQueries({ queryKey: ['units-stats'] })
  }

  const createMut = useMutation({
    mutationFn: (payload) => axiosInstance.post('/units', payload),
    onSuccess: () => { invalidate(); closeModal(); toast({ title: 'Unit created', variant: 'success' }) },
    onError: (e) => toast({ title: 'Create failed', description: e.response?.data?.message, variant: 'error' }),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, payload }) => axiosInstance.patch(`/units/${id}`, payload),
    onSuccess: () => { invalidate(); closeModal(); toast({ title: 'Unit updated', variant: 'success' }) },
    onError: (e) => toast({ title: 'Update failed', description: e.response?.data?.message, variant: 'error' }),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => axiosInstance.delete(`/units/${id}`),
    onSuccess: () => { invalidate(); setDeleteItem(null); toast({ title: 'Unit deleted', variant: 'success' }) },
    onError: (e) => toast({ title: 'Delete failed', description: e.response?.data?.message, variant: 'error' }),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }) => axiosInstance.patch(`/units/${id}`, { isActive }),
    onSuccess: () => { invalidate(); toast({ title: 'Unit updated', variant: 'success' }) },
    onError: (e) => toast({ title: 'Update failed', description: e.response?.data?.message, variant: 'error' }),
  })

  const closeModal = () => { setModalOpen(false); setEditItem(null); form.reset() }

  const openCreate = () => {
    setEditItem(null)
    form.reset({ name: '', symbol: '', unitType: '', description: '', baseUnit: '', conversionFactor: '', isActive: true })
    setModalOpen(true)
  }

  const openEdit = (item) => {
    setEditItem(item)
    form.reset({
      name:             item.name,
      symbol:           item.symbol,
      unitType:         item.unitType,
      description:      item.description || '',
      baseUnit:         item.baseUnit || '',
      conversionFactor: item.conversionFactor || '',
      isActive:         item.isActive,
    })
    setModalOpen(true)
  }

  const handleSubmit = (values) => {
    const payload = {
      ...values,
      description:      values.description || undefined,
      baseUnit:         values.baseUnit || undefined,
      conversionFactor: values.conversionFactor || undefined,
    }
    if (editItem) {
      const allowed = editItem.isSystem ? { isActive: payload.isActive } : payload
      updateMut.mutate({ id: editItem._id, payload: allowed })
    } else {
      createMut.mutate(payload)
    }
  }

  const units      = data?.data ?? []
  const total      = data?.pagination?.total ?? 0
  const stats      = statsData?.data

  if (error) return <ErrorState error={error} onRetry={refetch} />

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Scale className="h-5 w-5" style={{ color: '#22C55E' }} />
            <h1 className="text-[22px] font-bold" style={{ color: 'var(--text-primary)' }}>Units</h1>
            <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(34,197,94,.1)', color: '#22C55E' }}>
              {total}
            </span>
          </div>
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
            Manage measurement units. System units cannot be deleted.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={refetch}>Refresh</Button>
          <Button size="sm" icon={Plus} onClick={openCreate}>Add Unit</Button>
        </div>
      </motion.div>

      {/* Stats */}
      {stats && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Total"    value={stats.total}    color="#22C55E" />
          <StatCard label="Active"   value={stats.active}   color="#2563EB" />
          <StatCard label="Inactive" value={stats.inactive} color="#94A3B8" />
        </motion.div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-50">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search name or symbol…"
                className="w-full text-[13px] pl-9 pr-3 py-2 rounded-lg outline-none"
                style={{ background: 'var(--surface-input)', border: '1.5px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
              className="text-[13px] px-3 py-2 rounded-lg outline-none"
              style={{ background: 'var(--surface-input)', border: '1.5px solid var(--border)', color: 'var(--text-primary)' }}>
              <option value="">All Types</option>
              {UNIT_TYPES.map(t => <option key={t} value={t}>{TYPE_CFG[t]?.label || t}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        {isLoading ? (
          <SkeletonTable rows={8} cols={6} />
        ) : units.length === 0 ? (
          <EmptyState
            title="No units found"
            description={search || typeFilter ? 'Try adjusting your filters.' : 'Add your first unit.'}
            action={<Button size="sm" icon={Plus} onClick={openCreate}>Add Unit</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Name', 'Symbol', 'Type', 'Conversion', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {units.map((unit) => (
                  <tr key={unit._id} style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{unit.name}</span>
                        {unit.isSystem && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                            style={{ background: 'rgba(245,158,11,.12)', color: '#F59E0B' }}>
                            <Lock className="h-2.5 w-2.5" /> System
                          </span>
                        )}
                      </div>
                      {unit.description && (
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{unit.description}</p>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <code className="text-[12px] font-mono px-2 py-0.5 rounded"
                        style={{ background: 'var(--surface-muted)', color: 'var(--text-primary)' }}>
                        {unit.symbol}
                      </code>
                    </td>

                    <td className="px-4 py-3"><TypeBadge type={unit.unitType} /></td>

                    <td className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      {unit.conversionFactor && unit.baseUnit
                        ? `${unit.conversionFactor}× ${unit.baseUnit}`
                        : '—'}
                    </td>

                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleMut.mutate({ id: unit._id, isActive: !unit.isActive })}
                        className="flex items-center gap-1.5 text-[11px] font-semibold"
                        style={{ color: unit.isActive ? '#22C55E' : '#94A3B8' }}>
                        {unit.isActive
                          ? <ToggleRight className="h-5 w-5" />
                          : <ToggleLeft  className="h-5 w-5" />}
                        {unit.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => openEdit(unit)}
                          className="p-1.5 rounded-lg"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#2563EB'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        {!unit.isSystem && (
                          <button onClick={() => setDeleteItem(unit)}
                            className="p-1.5 rounded-lg"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && (
          <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
            />
          </div>
        )}
      </Card>

      {/* Modal */}
      <Modal open={modalOpen} onClose={closeModal} title={editItem ? `Edit: ${editItem.name}` : 'New Unit'}>
        <UnitForm
          form={form}
          onSubmit={handleSubmit}
          loading={createMut.isPending || updateMut.isPending}
          isSystem={editItem?.isSystem}
        />
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={() => deleteMut.mutate(deleteItem._id)}
        loading={deleteMut.isPending}
        title="Delete Unit"
        description={`Delete "${deleteItem?.name}"? Cannot be undone.`}
        confirmLabel="Delete"
      />
    </div>
  )
}
