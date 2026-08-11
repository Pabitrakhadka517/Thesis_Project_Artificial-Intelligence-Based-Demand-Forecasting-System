import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Package, Plus, Search, Edit2, Trash2, Filter, Eye,
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
import { EmptyState } from '@/components/common/EmptyState'
import { SkeletonTable } from '@/components/common/Skeleton'
import { Modal, ConfirmDialog } from '@/components/common/Modal'
import { Input } from '@/components/common/Input'
import { Select } from '@/components/common/Select'
import { Textarea } from '@/components/common/Textarea'
import { Pagination } from '@/components/common/Pagination'
import { useSortable } from '@/hooks/useSortable'
import { useDebounce } from '@/hooks/useDebounce'
import { SortableTH } from '@/components/common/SortableTH'
import { PageHeader } from '@/components/common/PageHeader'
import { IconButton } from '@/components/common/IconButton'
import { Button } from '@/components/common/Button'

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
        <Input label="Product Name *" placeholder="Rice (Basmati 5kg)" error={errors.name?.message} {...register('name')} />
        <Input label="SKU *" placeholder="RICE-5KG-001" error={errors.sku?.message} {...register('sku')} />
        <Input label="Brand" placeholder="Annapurna" {...register('brand')} />
        <Select label="Unit" options={UNITS.map(u => ({ value: u, label: u }))} {...register('unit')} />
        <Select label="Category *" placeholder="-- Select Category --" error={errors.category?.message}
          options={categories.map(c => ({ value: c._id, label: c.name }))} {...register('category')} />
        <Select label="Supplier" placeholder="-- Select Supplier --"
          options={suppliers.map(s => ({ value: s._id, label: s.name }))} {...register('supplier')} />
        <Input label="Buying Price (Rs) *" type="number" min={0} step="0.01" placeholder="0.00" error={errors.buyingPrice?.message} {...register('buyingPrice')} />
        <Input label="Selling Price (Rs) *" type="number" min={0} step="0.01" placeholder="0.00" error={errors.sellingPrice?.message} {...register('sellingPrice')} />
        <Input label="Current Stock" type="number" min={0} {...register('currentStock')} />
        <Input label="Min Stock" type="number" min={0} {...register('minStock')} />
        <Input label="Max Stock" type="number" min={0} {...register('maxStock')} />
        <Input label="Reorder Level" type="number" min={0} {...register('reorderLevel')} />
      </div>
      <Textarea label="Description" rows={2} placeholder="Optional product description…" {...register('description')} />
      {apiError && (
        <div role="alert" className="px-3 py-2.5 rounded-lg text-[13px] font-medium text-center"
          style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', color: 'var(--brand-red)' }}>
          {apiError}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={isPending || isSubmitting} loading={isPending || isSubmitting}>
        {(isPending || isSubmitting) ? 'Saving…' : submitLabel}
      </Button>
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
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['products', page, pageSize, debouncedSearch, stockFilter, catFilter, sort.sortBy, sort.sortDir],
    queryFn: () => productsService.getAll({
      page, limit: pageSize, search: debouncedSearch, stockStatus: stockFilter, category: catFilter,
      sortBy: sort.sortBy, sortDir: sort.sortDir,
    }).then(r => r.data),
    staleTime: 30_000,
  })

  const onSort = (key) => { sort.toggle(key); setPage(1) }

  const { data: supplierData } = useQuery({
    queryKey: ['suppliers-list'],
    queryFn: () => axiosInstance.get('/suppliers?limit=100').then(r => r.data?.data?.suppliers || r.data?.data || []),
    staleTime: 60_000,
  })

  const { data: catData } = useQuery({
    queryKey: ['categories-list'],
    queryFn: () => axiosInstance.get('/categories?limit=100').then(r => r.data?.data?.categories || r.data?.data || []),
    staleTime: 60_000,
  })

  const products   = data?.data || []
  const total      = data?.pagination?.total || 0
  const suppliers  = supplierData || []
  const categories = catData || []

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
      <PageHeader
        icon={Package}
        eyebrow="Catalog"
        title="Products"
        subtitle={`${total} products in catalog`}
        actions={can('inventory_manager') && (
          <Button icon={Plus} onClick={() => setCreate(true)}>
            Add Product
          </Button>
        )}
      />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 h-9 rounded-lg flex-1 min-w-48"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input type="text" placeholder="Search by name, SKU or brand…" aria-label="Search products by name, SKU, or brand" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: 'var(--text-primary)' }} />
        </div>
        <select value={stockFilter} onChange={e => { setStock(e.target.value); setPage(1) }}
          aria-label="Filter by stock status"
          className="h-9 px-3 rounded-lg text-[13px] outline-none"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All Stock</option>
          <option value="out_of_stock">Out of Stock</option>
          <option value="critical">Critical</option>
          <option value="healthy">Healthy</option>
          <option value="overstock">Overstock</option>
        </select>
        <select value={catFilter} onChange={e => { setCat(e.target.value); setPage(1) }}
          aria-label="Filter by category"
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
        <div className="rounded-xl" style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <EmptyState
            icon={Package}
            title={search || stockFilter || catFilter ? 'No matching products' : 'No products yet'}
            description={search || stockFilter || catFilter ? 'Try a different search or clear the filters above.' : 'Add your first product to start building the catalog.'}
            action={
              (search || stockFilter || catFilter) ? (
                <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setStock(''); setCat(''); setPage(1) }}>Clear filters</Button>
              ) : can('inventory_manager') ? (
                <Button size="sm" icon={Plus} onClick={() => setCreate(true)}>Add Product</Button>
              ) : undefined
            }
          />
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
              {products.map((p) => (
                <tr key={p._id}
                  className="border-b last:border-b-0"
                  style={{ borderColor: 'var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg shrink-0 overflow-hidden"
                        style={{ background: 'rgba(37,99,235,.1)' }}>
                        <img src={getProductImage(p)} alt={p.name} loading="lazy" decoding="async"
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
                    <div className="flex gap-1">
                      <IconButton
                        icon={Eye}
                        label="View details"
                        variant="primary"
                        onClick={() => navigate(`${prefix}/products/${p._id}`)}
                        size={14}
                      />
                      {can('inventory_manager') && (
                        <IconButton icon={Edit2} label="Edit product" onClick={() => setEdit(p)} size={14} />
                      )}
                      {isAdmin && (
                        <IconButton
                          icon={Trash2}
                          label="Delete product"
                          variant="danger"
                          onClick={() => setDeleteTarget(p)}
                          size={14}
                        />
                      )}
                    </div>
                  </td>
                </tr>
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
      <Modal
        open={creating}
        width={680}
        title="Add Product"
        onClose={() => { setCreate(false); pendingImageRef.current = null; setCreateApiError('') }}
      >
        {creating && (
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
        )}
      </Modal>
      <Modal
        open={!!editing}
        width={680}
        title="Edit Product"
        onClose={() => { setEdit(null); pendingImageRef.current = null; removeImageRef.current = false }}
      >
        {editing && (
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
        )}
      </Modal>
    </div>
  )
}
