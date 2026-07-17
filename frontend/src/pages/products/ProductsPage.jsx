import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Package, Plus, Search, Edit2, Trash2, X, Filter, Eye,
  AlertTriangle, CheckCircle, XCircle, TrendingDown,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import axiosInstance from '@/api/axiosInstance'
import { productsService } from '@/services/productsService'
import { getProductImage, imgFallback, BACKEND_URL, formatRs, STOCK_STATUS } from '@/utils'
import { useToast } from '@/hooks/useToast'
import { useRole } from '@/hooks/useRole'
import { ImageUpload } from '@/components/common/ImageUpload'
import { ErrorState } from '@/components/common/ErrorState'
import { SkeletonTable } from '@/components/common/Skeleton'
import { ConfirmDialog } from '@/components/common/Modal'
import { Pagination } from '@/components/common/Pagination'
import { useSortable } from '@/hooks/useSortable'
import { SortableTH } from '@/components/common/SortableTH'

const schema = z.object({
  name:          z.string().min(2, 'Product name required'),
  sku:           z.string().min(1, 'SKU required'),
  brand:         z.string().optional(),
  category:      z.string().min(1, 'Category is required'),
  supplier:      z.string().optional().transform(v => v || undefined),
  unit:          z.string().default('piece'),
  buyingPrice:   z.coerce.number().min(0, 'Required'),
  sellingPrice:  z.coerce.number().min(0, 'Required'),
  currentStock:  z.coerce.number().min(0).default(0),
  minStock:      z.coerce.number().min(0).default(10),
  maxStock:      z.coerce.number().min(0).default(100),
  reorderLevel:  z.coerce.number().min(0).default(10),
  description:   z.string().optional(),
})

const UNITS = ['piece','kg','gram','liter','ml','box','pack','dozen','meter','set']

const STATUS_ICON = { out_of_stock: XCircle, critical: AlertTriangle, healthy: CheckCircle, overstock: TrendingDown }
const STATUS_CONFIG = Object.fromEntries(
  Object.entries(STOCK_STATUS).map(([k, v]) => [k, { ...v, Icon: STATUS_ICON[k] || CheckCircle }])
)

function StockBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.healthy
  const { Icon } = cfg
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}>
      <Icon className="h-3 w-3" />{cfg.label}
    </span>
  )
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5"
        style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
      {error && <p className="text-[11px] mt-1" style={{ color: 'var(--error)' }}>{error}</p>}
    </div>
  )
}

function FInput({ error, ...props }) {
  return (
    <input
      className="w-full px-3 py-2.5 rounded-lg text-[13px] outline-none"
      style={{
        background: 'var(--surface-muted)',
        border: `1.5px solid ${error ? 'var(--error)' : 'var(--border)'}`,
        color: 'var(--text-primary)',
      }}
      onFocus={e => { if (!error) e.target.style.borderColor = 'var(--brand)' }}
      onBlur={e => { if (!error) e.target.style.borderColor = 'var(--border)' }}
      {...props}
    />
  )
}

function FSelect({ error, ...props }) {
  return (
    <select
      className="w-full px-3 py-2.5 rounded-lg text-[13px] outline-none"
      style={{ background: 'var(--surface-muted)', border: `1.5px solid ${error ? 'var(--error)' : 'var(--border)'}`, color: 'var(--text-primary)' }}
      {...props}
    />
  )
}

function Modal({ title, onClose, children }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: .95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: .95, y: 12 }}
        className="w-full max-w-2xl rounded-2xl p-6 overflow-y-auto max-h-[90vh]"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
          <button onClick={onClose}
            className="h-7 w-7 rounded-md flex items-center justify-center"
            style={{ color: 'var(--text-muted)', background: 'var(--surface-muted)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

function ProductForm({ defaultValues, suppliers, categories, onSubmit, isPending, submitLabel,
                        onImageSelect, onImageRemove, currentImage, imageUploading, apiError }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaultValues
      ? { ...defaultValues, category: defaultValues.category?._id || defaultValues.category || '', supplier: defaultValues.supplier?._id || defaultValues.supplier || '' }
      : { unit: 'piece', currentStock: 0, minStock: 10, maxStock: 100, reorderLevel: 10 },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Product image */}
      <div className="flex items-center gap-4 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <ImageUpload
          value={currentImage || null}
          onFileSelect={onImageSelect}
          onRemove={onImageRemove}
          uploading={imageUploading}
          label="Product Image"
          shape="square"
          size="sm"
        />
        <div>
          <p className="text-[12px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Product Image</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Optional. JPEG, PNG, or WebP — max 5 MB.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Product Name *" error={errors.name?.message}>
          <FInput placeholder="Rice (Basmati 5kg)" error={!!errors.name} {...register('name')} />
        </Field>
        <Field label="SKU *" error={errors.sku?.message}>
          <FInput placeholder="RICE-5KG-001" error={!!errors.sku} {...register('sku')} />
        </Field>
        <Field label="Brand">
          <FInput placeholder="Annapurna" {...register('brand')} />
        </Field>
        <Field label="Unit">
          <FSelect {...register('unit')}>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </FSelect>
        </Field>
        <Field label="Category *" error={errors.category?.message}>
          <FSelect error={!!errors.category} {...register('category')}>
            <option value="">-- Select Category --</option>
            {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </FSelect>
        </Field>
        <Field label="Supplier">
          <FSelect {...register('supplier')}>
            <option value="">-- Select Supplier --</option>
            {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
          </FSelect>
        </Field>
        <Field label="Buying Price (Rs) *" error={errors.buyingPrice?.message}>
          <FInput type="number" min={0} step="0.01" placeholder="0.00" error={!!errors.buyingPrice} {...register('buyingPrice')} />
        </Field>
        <Field label="Selling Price (Rs) *" error={errors.sellingPrice?.message}>
          <FInput type="number" min={0} step="0.01" placeholder="0.00" error={!!errors.sellingPrice} {...register('sellingPrice')} />
        </Field>
        <Field label="Current Stock">
          <FInput type="number" min={0} {...register('currentStock')} />
        </Field>
        <Field label="Min Stock">
          <FInput type="number" min={0} {...register('minStock')} />
        </Field>
        <Field label="Max Stock">
          <FInput type="number" min={0} {...register('maxStock')} />
        </Field>
        <Field label="Reorder Level">
          <FInput type="number" min={0} {...register('reorderLevel')} />
        </Field>
      </div>
      <Field label="Description">
        <textarea rows={2} placeholder="Optional product description…"
          className="w-full px-3 py-2.5 rounded-lg text-[13px] outline-none resize-none"
          style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)', color: 'var(--text-primary)' }}
          {...register('description')}
        />
      </Field>
      {apiError && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] font-medium text-center"
          style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', color: 'var(--error)' }}>
          {apiError}
        </div>
      )}
      <button type="submit" disabled={isPending || isSubmitting}
        className="w-full py-2.5 rounded-xl text-[14px] font-bold text-white"
        style={{ background: 'var(--brand-primary)', opacity: (isPending || isSubmitting) ? .7 : 1 }}>
        {(isPending || isSubmitting) ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}

export default function ProductsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { can, prefix, isAdmin, isManager } = useRole()

  const [search, setSearch]       = useState('')
  const [stockFilter, setStock]   = useState('')
  const [catFilter, setCat]       = useState('')
  const [page, setPage]           = useState(1)
  const [creating, setCreate]     = useState(false)
  const [editing, setEdit]        = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [createApiError, setCreateApiError] = useState('')
  const pendingImageRef           = useRef(null)
  const removeImageRef            = useRef(false)
  const [pageSize, setPageSize]   = useState(20)
  const sort = useSortable('createdAt', 'desc')

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['products', page, pageSize, search, stockFilter, catFilter, sort.sortBy, sort.sortDir],
    queryFn: () => productsService.getAll({
      page, limit: pageSize, search, stockStatus: stockFilter, category: catFilter,
      sortBy: sort.sortBy, sortDir: sort.sortDir,
    }).then(r => r.data),
    staleTime: 30_000,
  })

  const onSort = (key) => { sort.toggle(key); setPage(1) }

  const { data: supplierData } = useQuery({
    queryKey: ['suppliers-list'],
    queryFn: () => axiosInstance.get('/suppliers?limit=100').then(r => r.data),
    staleTime: 60_000,
  })

  const { data: catData } = useQuery({
    queryKey: ['categories-list'],
    queryFn: () => axiosInstance.get('/categories?limit=100').then(r => r.data),
    staleTime: 60_000,
  })

  const products   = data?.data || []
  const total      = data?.pagination?.total || 0
  const suppliers  = supplierData?.data || []
  const categories = catData?.data?.categories || []

  const createMutation = useMutation({
    mutationFn: (d) => productsService.create(d),
    onSuccess: async (res) => {
      const newId = res.data?.data?.product?._id
      qc.invalidateQueries({ queryKey: ['products'] })
      if (pendingImageRef.current && newId) {
        try {
          await productsService.uploadImage(newId, pendingImageRef.current)
          qc.invalidateQueries({ queryKey: ['products'] })
        } catch (e) {
          toast({ title: e.response?.data?.message || 'Image upload failed', variant: 'error' })
        }
        pendingImageRef.current = null
      }
      setCreateApiError('')
      toast({ title: 'Product added', variant: 'success' })
      setCreate(false)
    },
    onError: (e) => {
      const msg = e.response?.data?.message || 'Failed to add product'
      setCreateApiError(msg)
      toast({ title: msg, variant: 'error' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => productsService.update(id, data),
    onSuccess: async (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['products'] })
      if (removeImageRef.current) {
        try { await productsService.deleteImage(id) } catch { /* non-fatal */ }
        removeImageRef.current = false
      } else if (pendingImageRef.current) {
        try {
          await productsService.uploadImage(id, pendingImageRef.current)
          qc.invalidateQueries({ queryKey: ['products'] })
        } catch (e) {
          toast({ title: e.response?.data?.message || 'Image upload failed', variant: 'error' })
        }
        pendingImageRef.current = null
      }
      toast({ title: 'Product updated', variant: 'success' })
      setEdit(null)
    },
    onError: (e) => toast({ title: e.response?.data?.message || 'Failed to update', variant: 'error' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => productsService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      toast({ title: 'Product deleted', variant: 'success' })
      setDeleteTarget(null)
    },
    onError: (e) => toast({ title: e.response?.data?.message || 'Failed to delete', variant: 'error' }),
  })

  const formatPrice = (n) => formatRs(n, { abbreviate: false })

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold" style={{ color: 'var(--text-primary)' }}>Products</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {total} products in catalog
          </p>
        </div>
        {can('inventory_manager') && (
          <button onClick={() => setCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold text-white"
            style={{ background: 'var(--brand-primary)', boxShadow: '0 4px 16px rgba(3,4,94,.4)' }}>
            <Plus className="h-4 w-4" /> Add Product
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 h-9 rounded-lg flex-1 min-w-48"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input type="text" placeholder="Search by name, SKU or brand…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: 'var(--text-primary)' }} />
        </div>
        <select value={stockFilter} onChange={e => { setStock(e.target.value); setPage(1) }}
          className="h-9 px-3 rounded-lg text-[13px] outline-none"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All Stock</option>
          <option value="out_of_stock">Out of Stock</option>
          <option value="critical">Critical</option>
          <option value="healthy">Healthy</option>
          <option value="overstock">Overstock</option>
        </select>
        <select value={catFilter} onChange={e => { setCat(e.target.value); setPage(1) }}
          className="h-9 px-3 rounded-lg text-[13px] outline-none"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-xl p-5"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <SkeletonTable rows={8} cols={8} />
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : products.length === 0 ? (
        <div className="text-center py-16">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-20" style={{ color: 'var(--text-muted)' }} />
          <p className="text-[14px]" style={{ color: 'var(--text-muted)' }}>No products found</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-x-auto"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                <SortableTH label="Product" sortKey="name" sortBy={sort.sortBy} sortDir={sort.sortDir} onSort={onSort} />
                <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>SKU</th>
                <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Category</th>
                <SortableTH label="Stock" sortKey="currentStock" sortBy={sort.sortBy} sortDir={sort.sortDir} onSort={onSort} />
                <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Status</th>
                <SortableTH label="Buying" sortKey="buyingPrice" sortBy={sort.sortBy} sortDir={sort.sortDir} onSort={onSort} />
                <SortableTH label="Selling" sortKey="sellingPrice" sortBy={sort.sortBy} sortDir={sort.sortDir} onSort={onSort} />
                <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, idx) => (
                <motion.tr key={p._id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="border-b last:border-b-0"
                  style={{ borderColor: 'var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg shrink-0 overflow-hidden"
                        style={{ background: 'rgba(37,99,235,.1)' }}>
                        <img src={getProductImage(p)} alt={p.name}
                          className="h-8 w-8 object-cover" onError={imgFallback} />
                      </div>
                      <div className="min-w-0">
                        <button
                          onClick={() => navigate(`${prefix}/products/${p._id}`)}
                          className="font-semibold truncate max-w-40 text-left hover:underline"
                          style={{ color: 'var(--text-primary)' }}>
                          {p.name}
                        </button>
                        {p.brand && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{p.brand}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-[11px] px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)' }}>
                      {p.sku}
                    </code>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                    {p.category?.name || '—'}
                  </td>
                  <td className="px-4 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {p.currentStock} <span className="text-[11px] font-normal" style={{ color: 'var(--text-muted)' }}>{p.unit}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StockBadge status={p.stockStatus || 'healthy'} />
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                    {formatPrice(p.buyingPrice)}
                  </td>
                  <td className="px-4 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {formatPrice(p.sellingPrice)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => navigate(`${prefix}/products/${p._id}`)}
                        className="h-7 w-7 rounded-md flex items-center justify-center"
                        style={{ color: '#2563EB' }}
                        title="View details"
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(37,99,235,.1)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {can('inventory_manager') && (
                        <button onClick={() => setEdit(p)}
                          className="h-7 w-7 rounded-md flex items-center justify-center"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => setDeleteTarget(p)}
                          className="h-7 w-7 rounded-md flex items-center justify-center"
                          style={{ color: '#EF4444' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,.1)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)}
        title="Delete product?"
        description={`This permanently deletes "${deleteTarget?.name}". This action cannot be undone.`}
        loading={deleteMutation.isPending}
      />

      {/* Modals */}
      <AnimatePresence>
        {creating && (
          <Modal title="Add Product" onClose={() => { setCreate(false); pendingImageRef.current = null; setCreateApiError('') }}>
            <ProductForm
              suppliers={suppliers}
              categories={categories}
              onSubmit={async (data) => { setCreateApiError(''); try { await createMutation.mutateAsync(data) } catch {} }}
              isPending={createMutation.isPending}
              submitLabel="Add Product"
              onImageSelect={(f) => { pendingImageRef.current = f }}
              onImageRemove={() => { pendingImageRef.current = null }}
              apiError={createApiError}
            />
          </Modal>
        )}
        {editing && (
          <Modal title="Edit Product" onClose={() => { setEdit(null); pendingImageRef.current = null; removeImageRef.current = false }}>
            <ProductForm
              defaultValues={editing}
              suppliers={suppliers}
              categories={categories}
              onSubmit={async (d) => { try { await updateMutation.mutateAsync({ id: editing._id, data: d }) } catch {} }}
              isPending={updateMutation.isPending}
              submitLabel="Save Changes"
              currentImage={editing.image ? `${BACKEND_URL}${editing.image}` : (editing.imageUrl || null)}
              onImageSelect={(f) => { pendingImageRef.current = f; removeImageRef.current = false }}
              onImageRemove={() => {
                pendingImageRef.current = null
                removeImageRef.current = true
              }}
            />
          </Modal>
        )}
      </AnimatePresence>
    </div>
  )
}
