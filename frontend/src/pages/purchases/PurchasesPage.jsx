import { useState, useEffect, Fragment } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { MOTION } from '@/constants'
import {
  ShoppingBag, Plus, Search, Trash2, CheckCircle,
  Clock, XCircle, Package, Truck, Minus,
  ChevronDown, ChevronUp, AlertCircle, DollarSign,
  BarChart2, TrendingUp, Calendar, CreditCard, FileText,
  User, Hash,
} from 'lucide-react'
import axiosInstance from '@/api/axiosInstance'
import { useToast } from '@/hooks/useToast'
import { useRole } from '@/hooks/useRole'
import { formatDate, getProductImage, imgFallback, formatRs, formatNumber } from '@/utils'
import { ErrorState } from '@/components/common/ErrorState'
import { EmptyState } from '@/components/common/EmptyState'
import { SkeletonTable } from '@/components/common/Skeleton'
import { Modal, ConfirmDialog } from '@/components/common/Modal'
import { Input } from '@/components/common/Input'
import { Select } from '@/components/common/Select'
import { Textarea } from '@/components/common/Textarea'
import { Button } from '@/components/common/Button'
import { Pagination } from '@/components/common/Pagination'
import { PageHeader } from '@/components/common/PageHeader'
import { useSortable } from '@/hooks/useSortable'
import { SortableTH } from '@/components/common/SortableTH'
import { useDebounce } from '@/hooks/useDebounce'

// ── constants ─────────────────────────────────────────────────────────────────
const PAY_STATUS_CFG = {
  paid:    { label: 'Paid',    color: '#10B981', bg: 'rgba(16,185,129,.12)' },
  partial: { label: 'Partial', color: '#F59E0B', bg: 'rgba(245,158,11,.12)' },
  pending: { label: 'Pending', color: '#EF4444', bg: 'rgba(239,68,68,.12)' },
}
const STATUS_CONFIG = {
  ordered:   { label: 'Ordered',   color: '#F59E0B', bg: 'rgba(245,158,11,.1)',  Icon: Clock },
  received:  { label: 'Received',  color: '#10B981', bg: 'rgba(16,185,129,.1)',  Icon: CheckCircle },
  cancelled: { label: 'Cancelled', color: '#EF4444', bg: 'rgba(239,68,68,.1)',   Icon: XCircle },
  partial:   { label: 'Partial',   color: '#6366F1', bg: 'rgba(99,102,241,.1)',  Icon: Clock },
}

// ── helpers ───────────────────────────────────────────────────────────────────
const fmtRs = formatRs
function fmtFull(n) { return formatRs(n, { abbreviate: false }) }

// ── shared UI ─────────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.ordered
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}>
      <cfg.Icon className="h-3 w-3" />{cfg.label}
    </span>
  )
}

function PayBadge({ paymentStatus }) {
  const cfg = PAY_STATUS_CFG[paymentStatus] || PAY_STATUS_CFG.pending
  return (
    <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

function KpiCard({ title, value, sub, icon: Icon, color }) {
  return (
    <div className="rounded-xl p-4 relative overflow-hidden"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: color }} />
      <div className="h-8 w-8 rounded-lg flex items-center justify-center mb-2"
        style={{ background: `${color}18` }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{title}</p>
      <p className="text-[20px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

// ── NEW PURCHASE MODAL ────────────────────────────────────────────────────────
function NewPurchaseModal({ onClose, preset }) {
  const qc = useQueryClient()
  const { toast } = useToast()

  const [items, setItems]          = useState([])
  // Arrived here from a Recommendations "Create PO" click — pre-fill the
  // product search with the suggested SKU so its result shows immediately.
  const [productSearch, setSearch] = useState(() => preset?.sku || '')
  const [showProds, setShowProds]  = useState(() => !!preset?.sku)
  const [supplierId, setSupplier]  = useState('')
  const [expectedDate, setExpDate] = useState('')
  const [notes, setNotes]          = useState('')
  const [submitted, setSubmitted]  = useState(false)

  const debouncedProductSearch = useDebounce(productSearch, 300)
  const { data: prodData } = useQuery({
    queryKey: ['products-po', debouncedProductSearch],
    queryFn: () => axiosInstance.get(`/products?search=${encodeURIComponent(debouncedProductSearch)}&limit=10`).then(r => r.data),
    enabled: debouncedProductSearch.length > 0,
    staleTime: 10_000,
  })
  const { data: suppData } = useQuery({
    queryKey: ['suppliers-po'],
    queryFn: () => axiosInstance.get('/suppliers?limit=100&status=active').then(r => r.data),
    staleTime: 60_000,
  })

  const products  = prodData?.data || []
  const suppliers = suppData?.data || []

  const addItem = (product) => {
    const quantity = preset?.sku === product.sku ? (preset.quantity || 1) : 1
    setItems(prev => {
      const existing = prev.find(i => i.productId === product._id)
      if (existing) return prev.map(i => i.productId === product._id ? { ...i, quantity: i.quantity + quantity } : i)
      return [...prev, {
        productId: product._id, name: product.name, sku: product.sku,
        unit: product.unit, unitPrice: product.buyingPrice, quantity,
        image: product.image || product.imageUrl || '',
      }]
    })
    setSearch(''); setShowProds(false)
  }

  const updateQty   = (id, qty) => {
    if (qty < 1) return removeItem(id)
    setItems(prev => prev.map(i => i.productId === id ? { ...i, quantity: qty } : i))
  }
  const updatePrice = (id, price) => setItems(prev => prev.map(i => i.productId === id ? { ...i, unitPrice: price } : i))
  const removeItem  = (id) => setItems(prev => prev.filter(i => i.productId !== id))

  const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)

  const mutation = useMutation({
    mutationFn: (d) => axiosInstance.post('/purchases', d),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['purchases'] })
      qc.invalidateQueries({ queryKey: ['purchase-stats'] })
      toast({ title: `PO ${res.data?.data?.purchase?.purchaseNumber} created`, variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: e.response?.data?.message || 'Failed to create PO', variant: 'error' }),
  })

  const fieldErrors = {
    items: items.length === 0 ? 'Add at least one product to this order.' : null,
    supplier: !supplierId ? 'Select a supplier before creating the order.' : null,
  }

  const handleSubmit = () => {
    setSubmitted(true)
    if (!items.length) return toast({ title: 'Add at least one product', variant: 'warning' })
    if (!supplierId)   return toast({ title: 'Select a supplier', variant: 'warning' })
    mutation.mutate({
      supplier: supplierId,
      expectedDeliveryDate: expectedDate || undefined,
      notes: notes || undefined,
      items: items.map(i => ({ product: i.productId, quantity: i.quantity, buyingPrice: i.unitPrice })),
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={672}
      title={
        <span className="inline-flex items-center gap-2">
          <ShoppingBag className="h-5 w-5" style={{ color: '#10B981' }} />
          New Purchase Order
        </span>
      }
      footer={
        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={mutation.isPending || !!(submitted && (fieldErrors.items || fieldErrors.supplier))}
          loading={mutation.isPending}
        >
          {mutation.isPending ? 'Creating…' : `Create Purchase Order · ${fmtFull(total)}`}
        </Button>
      }
    >
      <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Supplier *"
              value={supplierId}
              onChange={e => setSupplier(e.target.value)}
              placeholder="-- Select Supplier --"
              options={suppliers.map(s => ({ value: s._id, label: s.name }))}
              error={submitted ? fieldErrors.supplier : null}
            />
            <Input
              label="Expected Delivery"
              type="date"
              value={expectedDate}
              onChange={e => setExpDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
          </div>

          <div className="relative">
            <label htmlFor="po-product-search" className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5"
              style={{ color: 'var(--text-muted)' }}>Add Products</label>
            <div className="flex items-center gap-2 px-3 h-10 rounded-lg"
              style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)' }}>
              <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
              <input id="po-product-search" type="text" placeholder="Search by name or SKU…" value={productSearch}
                role="combobox" aria-expanded={showProds && products.length > 0} aria-controls="po-product-results" aria-autocomplete="list"
                onChange={e => { setSearch(e.target.value); setShowProds(true) }}
                onFocus={() => setShowProds(true)}
                className="flex-1 bg-transparent text-[13px] outline-none" style={{ color: 'var(--text-primary)' }} />
            </div>
            {showProds && products.length > 0 && (
              <div id="po-product-results" role="listbox" aria-label="Matching products"
                className="absolute top-full left-0 right-0 z-10 mt-1 rounded-xl shadow-xl overflow-hidden"
                style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
                {products.map(p => (
                  <button key={p._id} type="button" role="option" aria-selected="false" onClick={() => addItem(p)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-lg overflow-hidden shrink-0"
                        style={{ background: 'var(--surface-muted)' }}>
                        <img src={getProductImage(p)} alt="" aria-hidden="true" loading="lazy" decoding="async"
                          className="h-8 w-8 object-cover" onError={imgFallback} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</p>
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{p.sku} · stock: {p.currentStock}</p>
                      </div>
                    </div>
                    <span className="text-[13px] font-bold shrink-0 ml-4" style={{ color: '#10B981' }}>{fmtFull(p.buyingPrice)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {items.length === 0 ? (
            <div className="rounded-xl px-4 py-6 text-center text-[12px]"
              style={{ border: `1px dashed ${submitted && fieldErrors.items ? 'var(--brand-red)' : 'var(--border)'}`, color: submitted && fieldErrors.items ? 'var(--brand-red)' : 'var(--text-muted)' }}
              role={submitted && fieldErrors.items ? 'alert' : undefined}>
              {submitted && fieldErrors.items ? fieldErrors.items : 'Search for a product above to add it to this order.'}
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                    {['Product', 'Unit Price', 'Qty', 'Total', ''].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.productId} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-lg overflow-hidden shrink-0"
                            style={{ background: 'var(--surface-muted)' }}>
                            <img src={getProductImage(item)} alt={item.name} loading="lazy" decoding="async"
                              className="h-8 w-8 object-cover" onError={imgFallback} />
                          </div>
                          <div>
                            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{item.sku}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <input type="number" min={0} step="0.01" value={item.unitPrice}
                          aria-label={`Unit price for ${item.name}`}
                          onChange={e => updatePrice(item.productId, parseFloat(e.target.value) || 0)}
                          className="w-24 px-2 py-1 rounded text-[12px] outline-none"
                          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => updateQty(item.productId, item.quantity - 1)}
                            aria-label={`Decrease quantity of ${item.name}`}
                            className="h-6 w-6 rounded flex items-center justify-center"
                            style={{ background: 'var(--surface-muted)' }}>
                            <Minus className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
                          </button>
                          <input type="number" min={1} value={item.quantity}
                            aria-label={`Quantity of ${item.name}`}
                            onChange={e => updateQty(item.productId, parseInt(e.target.value) || 1)}
                            className="w-12 text-center text-[13px] font-bold outline-none bg-transparent"
                            style={{ color: 'var(--text-primary)' }} />
                          <button type="button" onClick={() => updateQty(item.productId, item.quantity + 1)}
                            aria-label={`Increase quantity of ${item.name}`}
                            className="h-6 w-6 rounded flex items-center justify-center"
                            style={{ background: 'var(--surface-muted)' }}>
                            <Plus className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-bold" style={{ color: 'var(--text-primary)' }}>
                        {fmtFull(item.unitPrice * item.quantity)}
                      </td>
                      <td className="px-3 py-2.5">
                        <button type="button" onClick={() => removeItem(item.productId)}
                          aria-label={`Remove ${item.name} from order`}
                          className="h-6 w-6 rounded flex items-center justify-center" style={{ color: '#EF4444' }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Textarea label="Notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Optional notes…" />

          {items.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: 'var(--surface-muted)' }}>
              <div className="flex justify-between text-[16px] font-bold">
                <span style={{ color: 'var(--text-primary)' }}>Total</span>
                <span style={{ color: '#10B981' }}>{fmtFull(total)}</span>
              </div>
            </div>
          )}
      </div>
    </Modal>
  )
}

// ── RECEIVE MODAL ─────────────────────────────────────────────────────────────
function ReceiveModal({ purchase, onClose }) {
  const qc = useQueryClient()
  const { toast } = useToast()

  const mutation = useMutation({
    mutationFn: () => axiosInstance.patch(`/purchases/${purchase._id}/receive`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] })
      qc.invalidateQueries({ queryKey: ['purchase-stats'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      toast({ title: 'Purchase received — stock updated', variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: e.response?.data?.message || 'Failed', variant: 'error' }),
  })

  return (
    <Modal
      open
      onClose={onClose}
      width={420}
      title={
        <span>
          Receive Goods
          <span className="block text-[12px] font-normal mt-0.5" style={{ color: 'var(--text-muted)' }}>{purchase.purchaseNumber}</span>
        </span>
      }
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={() => mutation.mutate()} loading={mutation.isPending}>
            {mutation.isPending ? 'Processing…' : 'Confirm Receipt'}
          </Button>
        </>
      }
    >
      <div className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid var(--border)' }}>
        {purchase.items?.map((item) => (
          <div key={item._id} className="flex items-center justify-between px-4 py-3 border-b last:border-b-0"
            style={{ borderColor: 'var(--border)' }}>
            <div>
              <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                {item.product?.name || item.productName}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {item.quantity} {item.product?.unit} × {fmtFull(item.unitPrice || item.buyingPrice)}
              </p>
            </div>
            <p className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
              {fmtFull(item.quantity * (item.unitPrice || item.buyingPrice))}
            </p>
          </div>
        ))}
      </div>

      <div className="p-3 rounded-xl text-[12px]" style={{ background: 'rgba(16,185,129,.1)' }}>
        <p style={{ color: '#10B981' }}>Confirming receipt will add all quantities to inventory and mark this PO as received.</p>
      </div>
    </Modal>
  )
}

// ── PAYMENT STATUS POPOVER ────────────────────────────────────────────────────
function PaymentUpdateBtn({ purchase }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [confirmStatus, setConfirmStatus] = useState(null)

  const mutation = useMutation({
    mutationFn: ({ paymentStatus }) => axiosInstance.patch(`/purchases/${purchase._id}/payment`, { paymentStatus }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] })
      qc.invalidateQueries({ queryKey: ['purchase-stats'] })
      toast({ title: 'Payment status updated', variant: 'success' })
      setOpen(false)
      setConfirmStatus(null)
    },
    onError: (e) => toast({ title: e.response?.data?.message || 'Failed', variant: 'error' }),
  })

  const current = PAY_STATUS_CFG[purchase.paymentStatus] || PAY_STATUS_CFG.pending

  // Marking a PO "Paid" is a financial record — confirm before committing it.
  // Switching between pending/partial stays a single click since it's easily reversible.
  const chooseStatus = (k) => {
    if (k === 'paid') setConfirmStatus(k)
    else mutation.mutate({ paymentStatus: k })
  }

  return (
    <div className="relative">
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        aria-haspopup="true" aria-expanded={open}
        aria-label={`Payment status: ${current.label}. Click to change.`}
        className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
        style={{ background: current.bg, color: current.color }}>
        {current.label}
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: .95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: .95 }}
            transition={{ duration: MOTION.fast, ease: MOTION.ease }}
            role="menu"
            className="absolute top-full left-0 mt-1 z-20 rounded-xl shadow-xl overflow-hidden w-28"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}>
            {Object.entries(PAY_STATUS_CFG).map(([k, v]) => (
              <button key={k} role="menuitem"
                disabled={k === purchase.paymentStatus || mutation.isPending}
                onClick={() => chooseStatus(k)}
                className="w-full text-left px-3 py-2 text-[12px] font-semibold disabled:opacity-40"
                style={{ color: v.color, borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => e.currentTarget.style.background = v.bg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {v.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!confirmStatus}
        onClose={() => setConfirmStatus(null)}
        onConfirm={() => mutation.mutate({ paymentStatus: confirmStatus })}
        title="Mark this order as paid?"
        description={`This records PO ${purchase.purchaseNumber} (${fmtFull(purchase.grandTotal)}) as fully paid to ${purchase.supplier?.name || 'the supplier'}.`}
        confirmLabel="Mark as Paid"
        loading={mutation.isPending}
      />
    </div>
  )
}

// ── EXPANDED ROW ──────────────────────────────────────────────────────────────
function PODetail({ purchase }) {
  return (
    <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
      <td colSpan={9} className="px-4 pb-4 pt-0">
        <div className="rounded-xl p-4 mt-1" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <div className="grid grid-cols-4 gap-4 mb-4">
            {[
              { icon: Truck,      label: 'Supplier',     value: purchase.supplier?.name || '—' },
              { icon: User,       label: 'Recorded By',  value: purchase.recordedBy?.fullName || '—' },
              { icon: Calendar,   label: 'Purchase Date',value: formatDate(purchase.purchaseDate || purchase.createdAt) },
              { icon: Calendar,   label: 'Delivery Date',value: purchase.deliveryDate ? formatDate(purchase.deliveryDate) : '—' },
            ].map(r => (
              <div key={r.label} className="flex items-start gap-2">
                <r.icon className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{r.label}</p>
                  <p className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>{r.value}</p>
                </div>
              </div>
            ))}
          </div>

          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Product', 'SKU', 'Qty', 'Unit Price', 'Total'].map(h => (
                  <th key={h} className="text-left pb-2 pr-4 text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {purchase.items?.map((item, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="py-2 pr-4 font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {item.productName || item.product?.name || '—'}
                  </td>
                  <td className="py-2 pr-4">
                    <code className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--surface-card)', color: 'var(--text-muted)' }}>
                      {item.sku}
                    </code>
                  </td>
                  <td className="py-2 pr-4" style={{ color: 'var(--text-secondary)' }}>{item.quantity}</td>
                  <td className="py-2 pr-4" style={{ color: 'var(--text-secondary)' }}>{fmtFull(item.buyingPrice || item.unitPrice)}</td>
                  <td className="py-2 pr-4 font-bold" style={{ color: 'var(--text-primary)' }}>{fmtFull(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-between items-center mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
            {purchase.notes && (
              <div className="flex items-start gap-2">
                <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{purchase.notes}</p>
              </div>
            )}
            <div className="ml-auto text-[14px] font-bold">
              <span style={{ color: 'var(--text-muted)' }}>Grand Total: </span>
              <span style={{ color: '#10B981' }}>{fmtFull(purchase.grandTotal)}</span>
            </div>
          </div>
        </div>
      </td>
    </motion.tr>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function PurchasesPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { can } = useRole()
  const location = useLocation()
  const navigate = useNavigate()

  // Arrived here via a "Create PO" click from the Recommendations page —
  // open the new-PO modal pre-loaded with the suggested product/quantity.
  // Captured once on mount; location.state is cleared right after so
  // navigating away and back doesn't silently reopen the modal.
  const [poPreset] = useState(() => (
    location.state?.presetSku
      ? { sku: location.state.presetSku, quantity: location.state.presetQty }
      : null
  ))

  const [search, setSearch]         = useState('')
  const [status, setStatus]         = useState('')
  const [supplierFilter, setSupFil] = useState('')
  const [startDate, setStartDate]   = useState('')
  const [endDate, setEndDate]       = useState('')
  const [page, setPage]             = useState(1)
  const [pageSize, setPageSize]     = useState(20)
  const [creating, setCreate]       = useState(!!poPreset)

  useEffect(() => {
    if (poPreset) navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [receiving, setReceive]     = useState(null)
  const [expanded, setExpanded]     = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const sort = useSortable('purchaseDate', 'desc')
  const debouncedSearch = useDebounce(search, 300)

  const { data: statsRaw } = useQuery({
    queryKey: ['purchase-stats'],
    queryFn:  () => axiosInstance.get('/purchases/stats').then(r => r.data.data),
    staleTime: 60_000,
  })
  const stats = statsRaw || {}

  const { data: suppData } = useQuery({
    queryKey: ['suppliers-filter'],
    queryFn:  () => axiosInstance.get('/suppliers?limit=100&status=active').then(r => r.data),
    staleTime: 120_000,
  })
  const suppliersList = suppData?.data || []

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['purchases', page, pageSize, debouncedSearch, status, supplierFilter, startDate, endDate, sort.sortBy, sort.sortDir],
    queryFn: () => {
      const qs = new URLSearchParams({
        page, limit: pageSize, sortBy: sort.sortBy, sortDir: sort.sortDir,
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(status         && { status }),
        ...(supplierFilter && { supplier: supplierFilter }),
        ...(startDate      && { startDate }),
        ...(endDate        && { endDate }),
      }).toString()
      return axiosInstance.get(`/purchases?${qs}`).then(r => r.data)
    },
    staleTime: 30_000,
  })

  const onSort = (key) => { sort.toggle(key); setPage(1) }
  const purchases  = data?.data        || []
  const total      = data?.pagination?.total      || 0

  const deleteMutation = useMutation({
    mutationFn: (id) => axiosInstance.delete(`/purchases/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] })
      qc.invalidateQueries({ queryKey: ['purchase-stats'] })
      toast({ title: 'Purchase order deleted', variant: 'success' })
      setDeleteTarget(null)
    },
    onError: (e) => toast({ title: e.response?.data?.message || 'Failed', variant: 'error' }),
  })

  const kpis = [
    { title: 'Pending Orders',   value: formatNumber(stats.pendingOrders || 0),  sub: 'awaiting receipt',          icon: Clock,      color: '#F59E0B' },
    { title: 'Monthly Spend',    value: fmtRs(stats.month?.total),          sub: `${stats.month?.count || 0} POs this month`, icon: TrendingUp, color: '#10B981' },
    { title: 'Outstanding',      value: fmtRs(stats.outstanding?.total),    sub: `${stats.outstanding?.count || 0} unpaid POs`, icon: AlertCircle,color: '#EF4444' },
    { title: 'Avg Order Value',  value: fmtRs(stats.avgOrder),              sub: 'all time',                  icon: BarChart2,  color: '#8B5CF6' },
  ]

  const clearFilters = () => { setSearch(''); setStatus(''); setSupFil(''); setStartDate(''); setEndDate(''); setPage(1) }
  const hasFilters = search || status || supplierFilter || startDate || endDate

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        icon={ShoppingBag}
        eyebrow="Transactions"
        title="Purchases"
        subtitle={`${total.toLocaleString()} purchase orders`}
        actions={can('inventory_manager') && (
          <button onClick={() => setCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold text-white"
            style={{ background: 'var(--brand-blue)' }}>
            <Plus className="h-4 w-4" /> New Purchase Order
          </button>
        )}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => <KpiCard key={k.title} {...k} />)}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex items-center gap-2 px-3 h-9 rounded-lg flex-1 min-w-48"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input type="text" placeholder="Search PO number or supplier…" aria-label="Search by PO number or supplier" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="flex-1 bg-transparent text-[13px] outline-none" style={{ color: 'var(--text-primary)' }} />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
          aria-label="Filter by status"
          className="h-9 px-3 rounded-lg text-[13px] outline-none"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All Status</option>
          <option value="ordered">Ordered</option>
          <option value="received">Received</option>
          <option value="cancelled">Cancelled</option>
          <option value="partial">Partial</option>
        </select>
        <select value={supplierFilter} onChange={e => { setSupFil(e.target.value); setPage(1) }}
          aria-label="Filter by supplier"
          className="h-9 px-3 rounded-lg text-[13px] outline-none"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All Suppliers</option>
          {suppliersList.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
        <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1) }}
          aria-label="Start date"
          className="h-9 px-3 rounded-lg text-[13px] outline-none"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1) }}
          aria-label="End date"
          className="h-9 px-3 rounded-lg text-[13px] outline-none"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        {hasFilters && (
          <button onClick={clearFilters} className="h-9 px-3 rounded-lg text-[12px] font-medium"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-xl p-4" style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <SkeletonTable rows={8} cols={9} />
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : purchases.length === 0 ? (
        <div className="rounded-xl" style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <EmptyState
            icon={ShoppingBag}
            title={hasFilters ? 'No matching purchase orders' : 'No purchase orders yet'}
            description={hasFilters ? 'Try a different search or clear the filters below.' : 'Create your first purchase order to restock inventory.'}
            action={hasFilters ? (
              <Button variant="secondary" size="sm" onClick={clearFilters}>Clear filters</Button>
            ) : can('inventory_manager') ? (
              <Button size="sm" icon={Plus} onClick={() => setCreate(true)}>New Purchase Order</Button>
            ) : undefined}
          />
        </div>
      ) : (
        <div className="rounded-xl overflow-x-auto"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                <SortableTH label="PO Number" sortKey="purchaseNumber" sortBy={sort.sortBy} sortDir={sort.sortDir} onSort={onSort} />
                {['Supplier', 'Items'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
                <SortableTH label="Total" sortKey="grandTotal" sortBy={sort.sortBy} sortDir={sort.sortDir} onSort={onSort} />
                {['Status', 'Payment'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
                <SortableTH label="Date" sortKey="purchaseDate" sortBy={sort.sortBy} sortDir={sort.sortDir} onSort={onSort} />
                {['Actions', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <Fragment key={p._id}>
                  <tr
                    className="border-b cursor-pointer"
                    style={{ borderColor: 'var(--border)', background: expanded === p._id ? 'var(--surface-muted)' : 'transparent' }}
                    onClick={() => setExpanded(prev => prev === p._id ? null : p._id)}
                    onMouseEnter={e => { if (expanded !== p._id) e.currentTarget.style.background = 'var(--surface-muted)' }}
                    onMouseLeave={e => { if (expanded !== p._id) e.currentTarget.style.background = 'transparent' }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 shrink-0" style={{ color: '#10B981' }} />
                        <code className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>{p.purchaseNumber}</code>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Truck className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                        <span style={{ color: 'var(--text-secondary)' }}>{p.supplier?.name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{p.items?.length || 0} item{(p.items?.length || 0) === 1 ? '' : 's'}</td>
                    <td className="px-4 py-3 font-bold" style={{ color: 'var(--text-primary)' }}>{fmtFull(p.grandTotal)}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      {can('inventory_manager')
                        ? <PaymentUpdateBtn purchase={p} />
                        : <PayBadge paymentStatus={p.paymentStatus} />}
                    </td>
                    <td className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      {formatDate(p.purchaseDate || p.createdAt, 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      {can('inventory_manager') && (
                        <div className="flex gap-1.5 items-center">
                          {p.status === 'ordered' && (
                            <button onClick={() => setReceive(p)}
                              aria-label={`Receive goods for ${p.purchaseNumber}`}
                              className="h-7 px-2 rounded-md flex items-center gap-1 text-[11px] font-semibold"
                              style={{ background: 'rgba(16,185,129,.1)', color: '#10B981' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,.2)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(16,185,129,.1)'}>
                              <CheckCircle className="h-3 w-3" /> Receive
                            </button>
                          )}
                          {p.status === 'ordered' && can('admin') && (
                            <button
                              onClick={() => setDeleteTarget(p)}
                              aria-label={`Delete purchase order ${p.purchaseNumber}`}
                              className="h-7 w-7 rounded-md flex items-center justify-center"
                              style={{ color: '#EF4444' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,.1)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={e => { e.stopPropagation(); setExpanded(prev => prev === p._id ? null : p._id) }}
                        aria-label={expanded === p._id ? `Collapse details for ${p.purchaseNumber}` : `Expand details for ${p.purchaseNumber}`}
                        aria-expanded={expanded === p._id}
                        className="h-6 w-6 rounded flex items-center justify-center"
                        style={{ color: 'var(--text-muted)' }}>
                        {expanded === p._id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                  </tr>
                  {expanded === p._id && <PODetail purchase={p} />}
                </Fragment>
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
        title="Delete purchase order?"
        description={`This permanently deletes PO ${deleteTarget?.purchaseNumber}. This action cannot be undone.`}
        loading={deleteMutation.isPending}
      />

      <AnimatePresence>
        {creating  && <NewPurchaseModal onClose={() => setCreate(false)} preset={poPreset} />}
        {receiving && <ReceiveModal purchase={receiving} onClose={() => setReceive(null)} />}
      </AnimatePresence>
    </div>
  )
}
