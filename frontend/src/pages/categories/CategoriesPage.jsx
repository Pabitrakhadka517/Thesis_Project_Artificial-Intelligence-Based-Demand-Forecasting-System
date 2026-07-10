import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { Tag, Plus, Search, Edit2, Trash2, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react'
import { Card, CardContent } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { Input } from '@/components/common/Input'
import { Modal, ConfirmDialog } from '@/components/common/Modal'
import { SkeletonTable } from '@/components/common/Skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { Pagination } from '@/components/common/Pagination'
import { useToast } from '@/hooks/useToast'
import axiosInstance from '@/api/axiosInstance'

const schema = z.object({
  name:        z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional().or(z.literal('')),
  isActive:    z.boolean().default(true),
})

export default function CategoriesPage() {
  const qc = useQueryClient()
  const { toast } = useToast()

  const [search,     setSearch]     = useState('')
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editItem,   setEditItem]   = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [page,       setPage]       = useState(1)
  const [pageSize,   setPageSize]   = useState(20)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['categories-page'],
    queryFn: () => axiosInstance.get('/categories').then(r => r.data),
    staleTime: 30_000,
  })

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '', isActive: true },
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['categories-page'] })

  const createMut = useMutation({
    mutationFn: (payload) => axiosInstance.post('/categories', payload),
    onSuccess: () => { invalidate(); closeModal(); toast({ title: 'Category created', variant: 'success' }) },
    onError: (e) => toast({ title: 'Create failed', description: e.response?.data?.message, variant: 'error' }),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, payload }) => axiosInstance.patch(`/categories/${id}`, payload),
    onSuccess: () => { invalidate(); closeModal(); toast({ title: 'Category updated', variant: 'success' }) },
    onError: (e) => toast({ title: 'Update failed', description: e.response?.data?.message, variant: 'error' }),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => axiosInstance.delete(`/categories/${id}`),
    onSuccess: () => { invalidate(); setDeleteItem(null); toast({ title: 'Category deleted', variant: 'success' }) },
    onError: (e) => toast({ title: 'Delete failed', description: e.response?.data?.message, variant: 'error' }),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }) => axiosInstance.patch(`/categories/${id}`, { isActive }),
    onSuccess: () => invalidate(),
    onError: (e) => toast({ title: 'Update failed', description: e.response?.data?.message, variant: 'error' }),
  })

  const closeModal = () => { setModalOpen(false); setEditItem(null); form.reset() }

  const openCreate = () => {
    setEditItem(null)
    form.reset({ name: '', description: '', isActive: true })
    setModalOpen(true)
  }

  const openEdit = (item) => {
    setEditItem(item)
    form.reset({ name: item.name, description: item.description || '', isActive: item.isActive })
    setModalOpen(true)
  }

  const handleSubmit = (values) => {
    const payload = { ...values, description: values.description || undefined }
    if (editItem) updateMut.mutate({ id: editItem._id, payload })
    else createMut.mutate(payload)
  }

  const allCategories = data?.data?.categories ?? []
  const filteredCategories = search
    ? allCategories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : allCategories
  const total = filteredCategories.length
  const categories = filteredCategories.slice((page - 1) * pageSize, page * pageSize)

  if (error) return <ErrorState error={error} onRetry={refetch} />

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Tag className="h-5 w-5" style={{ color: '#F59E0B' }} />
            <h1 className="text-[22px] font-bold" style={{ color: 'var(--text-primary)' }}>Categories</h1>
            <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(245,158,11,.1)', color: '#F59E0B' }}>
              {allCategories.length}
            </span>
          </div>
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
            Organize products into categories
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={refetch}>Refresh</Button>
          <Button size="sm" icon={Plus} onClick={openCreate}>Add Category</Button>
        </div>
      </motion.div>

      {/* Search */}
      <Card>
        <CardContent className="py-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search categories…"
              className="w-full text-[13px] pl-9 pr-3 py-2 rounded-lg outline-none"
              style={{ background: 'var(--surface-input)', border: '1.5px solid var(--border)', color: 'var(--text-primary)' }} />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        {isLoading ? (
          <SkeletonTable rows={8} cols={4} />
        ) : categories.length === 0 ? (
          <EmptyState
            title="No categories found"
            description={search ? 'Try a different search term.' : 'Add your first category to organize products.'}
            action={<Button size="sm" icon={Plus} onClick={openCreate}>Add Category</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Name', 'Description', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--text-muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <motion.tr key={cat._id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>

                    <td className="px-4 py-3">
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{cat.name}</span>
                    </td>

                    <td className="px-4 py-3 max-w-xs">
                      <span className="text-[12px] truncate block" style={{ color: 'var(--text-muted)' }}>
                        {cat.description || '—'}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleMut.mutate({ id: cat._id, isActive: !cat.isActive })}
                        className="flex items-center gap-1.5 text-[11px] font-semibold"
                        style={{ color: cat.isActive ? '#22C55E' : '#94A3B8' }}>
                        {cat.isActive
                          ? <ToggleRight className="h-5 w-5" />
                          : <ToggleLeft  className="h-5 w-5" />}
                        {cat.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => openEdit(cat)}
                          className="p-1.5 rounded-lg"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#2563EB'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setDeleteItem(cat)}
                          className="p-1.5 rounded-lg"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pagination */}
      {total > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
        />
      )}

      {/* Create / Edit modal */}
      <Modal open={modalOpen} onClose={closeModal} title={editItem ? `Edit: ${editItem.name}` : 'New Category'}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <Input label="Category Name *" placeholder="e.g. Grains & Cereals"
            error={form.formState.errors.name?.message}
            {...form.register('name')} />

          <Input label="Description" placeholder="Optional description"
            error={form.formState.errors.description?.message}
            {...form.register('description')} />

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" {...form.register('isActive')} className="w-4 h-4 rounded accent-blue-600" />
            <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>Active</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={closeModal}>Cancel</Button>
            <Button type="submit" loading={createMut.isPending || updateMut.isPending}>Save Category</Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={() => deleteMut.mutate(deleteItem._id)}
        loading={deleteMut.isPending}
        title="Delete Category"
        description={`Delete "${deleteItem?.name}"? This is permanent.`}
        confirmLabel="Delete"
      />
    </div>
  )
}
