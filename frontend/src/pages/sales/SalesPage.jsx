import { useState, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShoppingCart, Plus, Search, Trash2, Receipt,
  CheckCircle, Clock, XCircle, ChevronDown, ChevronUp,
  Minus, DollarSign, TrendingUp, BarChart2, Hash,
  Calendar, User, CreditCard, FileText,
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
import { Button } from '@/components/common/Button'
import { Pagination } from '@/components/common/Pagination'
import { PageHeader } from '@/components/common/PageHeader'
import { useSortable } from '@/hooks/useSortable'
import { SortableTH } from '@/components/common/SortableTH'
import { useDebounce } from '@/hooks/useDebounce'

// Loose phone check — accepts digits/spaces/+/- of plausible length; the
// backend doesn't enforce a strict format, so this only catches obvious typos.
const PHONE_RE = /^[0-9+\-\s]{7,20}$/

// ── constants ─────────────────────────────────────────────────────────────────
const PAYMENT_METHODS = ['cash', 'card', 'qr', 'credit']
const PAY_LABEL = { cash: 'Cash', card: 'Card', qr: 'QR/Mobile', credit: 'Credit' }
const STATUS_CFG = {
  completed: { label: 'Completed', color: '#10B981', bg: 'rgba(16,185,129,.1)',  Icon: CheckCircle },
  refunded:  { label: 'Refunded',  color: '#F59E0B', bg: 'rgba(245,158,11,.1)', Icon: Clock },
  void:      { label: 'Voided',    color: '#EF4444', bg: 'rgba(239,68,68,.1)',   Icon: XCircle },
}

// ── helpers ───────────────────────────────────────────────────────────────────
const fmtRs = formatRs
function fmtFull(n) { return formatRs(n, { abbreviate: false }) }

// ── shared UI ─────────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.completed
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}>
      <cfg.Icon className="h-3 w-3" />{cfg.label}
    </span>
  )
}

function KpiCard({ title, value, sub, icon: Icon, color }) {
  return (
    <div className="rounded-xl p-4 relative overflow-hidden"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: color }} />
      <div className="flex items-start justify-between mb-2">
        <div className="h-8 w-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{title}</p>
      <p className="text-[20px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

// ── NEW SALE MODAL ────────────────────────────────────────────────────────────
function NewSaleModal({ onClose }) {
  const qc = useQueryClient()
  const { toast } = useToast()

  const [items, setItems]           = useState([])
  const [productSearch, setSearch]  = useState('')
  const [showProducts, setShowProd] = useState(false)
  const [customerName, setCustomer] = useState('')
  const [customerPhone, setPhone]   = useState('')
  const [paymentMethod, setPay]     = useState('cash')
  const [discount, setDiscount]     = useState(0)
  const [notes, setNotes]           = useState('')
  const [submitted, setSubmitted]   = useState(false)

  const debouncedProductSearch = useDebounce(productSearch, 300)
  const { data: prodData } = useQuery({
    queryKey: ['products-search', debouncedProductSearch],
    queryFn:  () => axiosInstance.get(`/products?search=${encodeURIComponent(debouncedProductSearch)}&limit=10`).then(r => r.data),
    enabled:  debouncedProductSearch.length > 0,
    staleTime: 10_000,
  })
  const products = prodData?.data || []

  const addItem = (product) => {
    setItems(prev => {
      const existing = prev.find(i => i.productId === product._id)
      if (existing) return prev.map(i => i.productId === product._id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, {
        productId: product._id, name: product.name, sku: product.sku,
        unit: product.unit, price: product.sellingPrice, quantity: 1,
        maxQty: product.currentStock, image: product.image || product.imageUrl || '',
      }]
    })
    setSearch(''); setShowProd(false)
  }

  const updateQty = (id, qty) => {
    if (qty < 1) return setItems(p => p.filter(i => i.productId !== id))
    setItems(prev => prev.map(i => i.productId === id ? { ...i, quantity: qty } : i))
  }

  const subtotal    = items.reduce((s, i) => s + i.price * i.quantity, 0)
  const discountAmt = Math.min(discount, subtotal)
  const total       = subtotal - discountAmt

  // Validation is advisory guardrails on top of the existing submit behavior —
  // it never changes what gets sent (discountAmt is still clamped exactly as
  // before), it only surfaces a clearer message before the request is made.
  const fieldErrors = {
    items: items.length === 0 ? 'Add at least one product to the cart.' : null,
    customerPhone: customerPhone && !PHONE_RE.test(customerPhone) ? 'Enter a valid phone number.' : null,
    discount: discount > subtotal ? `Discount can't exceed the subtotal — it will be capped at ${fmtFull(subtotal)}.` : null,
  }
  // Only disable the submit button once a first attempt has revealed a blocking
  // error — otherwise the button would be permanently disabled while the cart
  // is empty and the user could never trigger the validation messages below.
  const hasBlockingError = submitted && (!!fieldErrors.items || !!fieldErrors.customerPhone)

  const mutation = useMutation({
    mutationFn: (d) => axiosInstance.post('/sales', d),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['sales'] })
      qc.invalidateQueries({ queryKey: ['sales-stats'] })
      toast({ title: `Sale ${res.data?.data?.sale?.invoiceNumber} recorded`, variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: e.response?.data?.message || 'Failed to record sale', variant: 'error' }),
  })

  const handleSubmit = () => {
    setSubmitted(true)
    if (!items.length) return toast({ title: 'Add at least one product', variant: 'warning' })
    if (fieldErrors.customerPhone) return toast({ title: fieldErrors.customerPhone, variant: 'warning' })
    mutation.mutate({
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      paymentMethod,
      discount: discountAmt,
      notes: notes || undefined,
      items: items.map(i => ({ product: i.productId, quantity: i.quantity, unitPrice: i.price })),
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={672}
      title={
        <span className="inline-flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" style={{ color: '#3B82F6' }} />
          New Sale
        </span>
      }
      footer={
        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={mutation.isPending || hasBlockingError}
          loading={mutation.isPending}
        >
          {mutation.isPending ? 'Recording…' : `Record Sale · ${fmtFull(total)}`}
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Product search */}
        <div className="relative">
          <label htmlFor="sale-product-search" className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Add Product
          </label>
          <div className="flex items-center gap-2 px-3 h-10 rounded-lg"
            style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)' }}>
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
            <input id="sale-product-search" type="text" placeholder="Search by name or SKU…" value={productSearch}
              role="combobox" aria-expanded={showProducts && products.length > 0} aria-controls="sale-product-results" aria-autocomplete="list"
              onChange={e => { setSearch(e.target.value); setShowProd(true) }}
              onFocus={() => setShowProd(true)}
              className="flex-1 bg-transparent text-[13px] outline-none" style={{ color: 'var(--text-primary)' }} />
          </div>
          {showProducts && products.length > 0 && (
            <div id="sale-product-results" role="listbox" aria-label="Matching products"
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
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {p.sku} · {p.currentStock} {p.unit} available
                        {p.currentStock === 0 && <span className="ml-1 text-red-500">OUT OF STOCK</span>}
                      </p>
                    </div>
                  </div>
                  <span className="text-[13px] font-bold ml-4 shrink-0" style={{ color: '#3B82F6' }}>{fmtFull(p.sellingPrice)}</span>
                </button>
              ))}
            </div>
          )}
          </div>

          {/* Cart */}
          {items.length === 0 ? (
            <div className="rounded-xl px-4 py-6 text-center text-[12px]"
              style={{ border: `1px dashed ${submitted && fieldErrors.items ? 'var(--brand-red)' : 'var(--border)'}`, color: submitted && fieldErrors.items ? 'var(--brand-red)' : 'var(--text-muted)' }}
              role={submitted && fieldErrors.items ? 'alert' : undefined}>
              {submitted && fieldErrors.items ? fieldErrors.items : 'Search for a product above to add it to this sale.'}
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                    {['Product', 'Price', 'Qty', 'Total', ''].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.productId} className="border-b last:border-b-0"
                      style={{ borderColor: 'var(--border)' }}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-lg overflow-hidden shrink-0"
                            style={{ background: 'var(--surface-muted)' }}>
                            <img src={getProductImage(item)} alt={item.name} loading="lazy" decoding="async"
                              className="h-8 w-8 object-cover" onError={imgFallback} />
                          </div>
                          <div>
                            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>max {item.maxQty} {item.unit}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>{fmtFull(item.price)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => updateQty(item.productId, item.quantity - 1)}
                            aria-label={`Decrease quantity of ${item.name}`}
                            className="h-6 w-6 rounded flex items-center justify-center"
                            style={{ background: 'var(--surface-muted)' }}>
                            <Minus className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
                          </button>
                          <input type="number" min={1} max={item.maxQty} value={item.quantity}
                            aria-label={`Quantity of ${item.name}`}
                            onChange={e => updateQty(item.productId, parseInt(e.target.value) || 1)}
                            className="w-12 text-center text-[13px] font-bold outline-none bg-transparent"
                            style={{ color: 'var(--text-primary)' }} />
                          <button type="button" onClick={() => updateQty(item.productId, item.quantity + 1)}
                            disabled={item.quantity >= item.maxQty}
                            aria-label={`Increase quantity of ${item.name}`}
                            className="h-6 w-6 rounded flex items-center justify-center disabled:opacity-40"
                            style={{ background: 'var(--surface-muted)' }}>
                            <Plus className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-bold" style={{ color: 'var(--text-primary)' }}>
                        {fmtFull(item.price * item.quantity)}
                      </td>
                      <td className="px-3 py-2.5">
                        <button type="button" onClick={() => setItems(p => p.filter(i => i.productId !== item.productId))}
                          aria-label={`Remove ${item.name} from cart`}
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

          {/* Sale details */}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Customer Name" placeholder="Walk-in customer" value={customerName}
              onChange={e => setCustomer(e.target.value)} />
            <Input label="Customer Phone" type="tel" placeholder="+977-98xxxxxxxx" value={customerPhone}
              onChange={e => setPhone(e.target.value)}
              error={submitted ? fieldErrors.customerPhone : null} />
            <Select label="Payment Method" value={paymentMethod} onChange={e => setPay(e.target.value)}
              options={PAYMENT_METHODS.map(m => ({ value: m, label: PAY_LABEL[m] }))} />
            <Input label="Discount (Rs.)" type="number" min={0} max={subtotal} value={discount}
              onChange={e => setDiscount(Number(e.target.value) || 0)}
              hint={fieldErrors.discount || undefined} />
            <Input className="col-span-2" label="Notes" placeholder="Optional notes…" value={notes}
              onChange={e => setNotes(e.target.value)} />
          </div>

          {/* Totals */}
          <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--surface-muted)' }}>
            <div className="flex justify-between text-[13px]">
              <span style={{ color: 'var(--text-muted)' }}>Subtotal</span>
              <span style={{ color: 'var(--text-secondary)' }}>{fmtFull(subtotal)}</span>
            </div>
            <div className="flex justify-between text-[13px]">
              <span style={{ color: 'var(--text-muted)' }}>Discount</span>
              <span style={{ color: '#EF4444' }}>− {fmtFull(discountAmt)}</span>
            </div>
            <div className="flex justify-between text-[16px] font-bold pt-2 border-t"
              style={{ borderColor: 'var(--border)' }}>
              <span style={{ color: 'var(--text-primary)' }}>Total</span>
              <span style={{ color: '#3B82F6' }}>{fmtFull(total)}</span>
            </div>
          </div>
        </div>
    </Modal>
  )
}

// ── EXPANDED ROW ──────────────────────────────────────────────────────────────
function SaleDetail({ sale }) {
  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}>
      <td colSpan={8} className="px-4 pb-4 pt-0">
        <div className="rounded-xl p-4 mt-1" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <div className="grid grid-cols-4 gap-4 mb-4">
            {[
              { icon: User,       label: 'Customer',  value: sale.customerName || 'Walk-in' },
              { icon: CreditCard, label: 'Payment',   value: PAY_LABEL[sale.paymentMethod] || sale.paymentMethod },
              { icon: Calendar,   label: 'Sale Date', value: formatDate(sale.saleDate || sale.createdAt) },
              { icon: FileText,   label: 'Notes',     value: sale.notes || '—' },
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
              {sale.items?.map((item, i) => (
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
                  <td className="py-2 pr-4" style={{ color: 'var(--text-secondary)' }}>{fmtFull(item.unitPrice)}</td>
                  <td className="py-2 pr-4 font-bold" style={{ color: 'var(--text-primary)' }}>{fmtFull(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end gap-6 mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
            {sale.discount > 0 && (
              <div className="text-[12px]">
                <span style={{ color: 'var(--text-muted)' }}>Discount: </span>
                <span style={{ color: '#EF4444' }}>− {fmtFull(sale.discount)}</span>
              </div>
            )}
            <div className="text-[14px] font-bold">
              <span style={{ color: 'var(--text-muted)' }}>Grand Total: </span>
              <span style={{ color: '#3B82F6' }}>{fmtFull(sale.grandTotal)}</span>
            </div>
          </div>
        </div>
      </td>
    </motion.tr>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function SalesPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { can } = useRole()

  const [search, setSearch]       = useState('')
  const [status, setStatus]       = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate]     = useState('')
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState(20)
  const [creating, setCreate]     = useState(false)
  const [expanded, setExpanded]   = useState(null)
  const [voidTarget, setVoidTarget] = useState(null)
  const sort = useSortable('saleDate', 'desc')
  const debouncedSearch = useDebounce(search, 300)

  const { data: statsRaw } = useQuery({
    queryKey: ['sales-stats'],
    queryFn:  () => axiosInstance.get('/sales/stats').then(r => r.data.data),
    staleTime: 60_000,
  })
  const stats = statsRaw || {}

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sales', page, pageSize, debouncedSearch, status, startDate, endDate, sort.sortBy, sort.sortDir],
    queryFn:  () => {
      const qs = new URLSearchParams({
        page, limit: pageSize, sortBy: sort.sortBy, sortDir: sort.sortDir,
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(status    && { status }),
        ...(startDate && { startDate }),
        ...(endDate   && { endDate }),
      }).toString()
      return axiosInstance.get(`/sales?${qs}`).then(r => r.data)
    },
    staleTime: 30_000,
  })

  const onSort = (key) => { sort.toggle(key); setPage(1) }
  const sales      = data?.data        || []
  const total      = data?.pagination?.total      || 0

  const voidMutation = useMutation({
    mutationFn: (id) => axiosInstance.delete(`/sales/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] })
      qc.invalidateQueries({ queryKey: ['sales-stats'] })
      toast({ title: 'Sale voided', variant: 'success' })
      setVoidTarget(null)
    },
    onError: (e) => toast({ title: e.response?.data?.message || 'Failed', variant: 'error' }),
  })

  const kpis = [
    { title: "Today's Revenue",   value: fmtRs(stats.today?.revenue),  sub: `${stats.today?.count || 0} sales today`,          icon: DollarSign,  color: '#2563EB' },
    { title: "Monthly Revenue",   value: fmtRs(stats.month?.revenue),  sub: `${stats.month?.count || 0} sales this month`,     icon: TrendingUp,  color: '#10B981' },
    { title: "Total Transactions",value: formatNumber(stats.total || 0), sub: 'all time completed',                               icon: Hash,        color: '#8B5CF6' },
    { title: "Avg Order Value",   value: fmtRs(stats.month?.count > 0 ? stats.month?.revenue / stats.month?.count : 0),
                                                                         sub: 'this month',                                       icon: BarChart2,   color: '#F59E0B' },
  ]

  const clearFilters = () => { setSearch(''); setStatus(''); setStartDate(''); setEndDate(''); setPage(1) }
  const hasFilters = search || status || startDate || endDate

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        icon={ShoppingCart}
        eyebrow="Transactions"
        title="Sales"
        subtitle={`${total.toLocaleString()} transactions recorded`}
        actions={
          <button onClick={() => setCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold text-white"
            style={{ background: 'var(--brand-primary)' }}>
            <Plus className="h-4 w-4" /> New Sale
          </button>
        }
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
          <input type="text" placeholder="Invoice or customer…" aria-label="Search by invoice or customer" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="flex-1 bg-transparent text-[13px] outline-none" style={{ color: 'var(--text-primary)' }} />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
          aria-label="Filter by status"
          className="h-9 px-3 rounded-lg text-[13px] outline-none"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All Status</option>
          <option value="completed">Completed</option>
          <option value="refunded">Refunded</option>
          <option value="void">Voided</option>
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
          <SkeletonTable rows={8} cols={8} />
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : sales.length === 0 ? (
        <div className="rounded-xl" style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <EmptyState
            icon={ShoppingCart}
            title={hasFilters ? 'No matching sales' : 'No sales recorded yet'}
            description={hasFilters ? 'Try a different search or clear the filters below.' : 'Record your first sale to see it here.'}
            action={hasFilters ? (
              <Button variant="secondary" size="sm" onClick={clearFilters}>Clear filters</Button>
            ) : (
              <Button size="sm" icon={Plus} onClick={() => setCreate(true)}>New Sale</Button>
            )}
          />
        </div>
      ) : (
        <div className="rounded-xl overflow-x-auto"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                <SortableTH label="Invoice" sortKey="invoiceNumber" sortBy={sort.sortBy} sortDir={sort.sortDir} onSort={onSort} />
                {['Customer', 'Items'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
                <SortableTH label="Total" sortKey="grandTotal" sortBy={sort.sortBy} sortDir={sort.sortDir} onSort={onSort} />
                {['Payment', 'Status'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
                <SortableTH label="Date" sortKey="saleDate" sortBy={sort.sortBy} sortDir={sort.sortDir} onSort={onSort} />
                <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <Fragment key={s._id}>
                  <tr
                    className="border-b cursor-pointer"
                    style={{ borderColor: 'var(--border)', background: expanded === s._id ? 'var(--surface-muted)' : 'transparent' }}
                    onClick={() => setExpanded(p => p === s._id ? null : s._id)}
                    onMouseEnter={e => { if (expanded !== s._id) e.currentTarget.style.background = 'var(--surface-muted)' }}
                    onMouseLeave={e => { if (expanded !== s._id) e.currentTarget.style.background = 'transparent' }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Receipt className="h-4 w-4 shrink-0" style={{ color: '#3B82F6' }} />
                        <code className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>{s.invoiceNumber}</code>
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{s.customerName || 'Walk-in'}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{s.items?.length || 0} item{(s.items?.length || 0) === 1 ? '' : 's'}</td>
                    <td className="px-4 py-3 font-bold" style={{ color: 'var(--text-primary)' }}>{fmtFull(s.grandTotal)}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{PAY_LABEL[s.paymentMethod] || s.paymentMethod}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      {formatDate(s.saleDate || s.createdAt, 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={e => { e.stopPropagation(); setExpanded(p => p === s._id ? null : s._id) }}
                          aria-label={expanded === s._id ? `Collapse details for ${s.invoiceNumber}` : `Expand details for ${s.invoiceNumber}`}
                          aria-expanded={expanded === s._id}
                          className="h-6 w-6 rounded flex items-center justify-center"
                          style={{ color: 'var(--text-muted)' }}>
                          {expanded === s._id
                            ? <ChevronUp className="h-3.5 w-3.5" />
                            : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                        {s.status === 'completed' && can('admin') && (
                          <button
                            onClick={e => { e.stopPropagation(); setVoidTarget(s) }}
                            aria-label={`Void sale ${s.invoiceNumber}`}
                            className="h-6 px-2 rounded text-[11px] font-semibold"
                            style={{ color: '#EF4444', background: 'rgba(239,68,68,.1)' }}>
                            Void
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded === s._id && <SaleDetail sale={s} />}
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
        open={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        onConfirm={() => voidMutation.mutate(voidTarget._id)}
        title="Void this sale?"
        description={`This voids invoice ${voidTarget?.invoiceNumber}. This action cannot be undone.`}
        confirmLabel="Void Sale"
        loading={voidMutation.isPending}
      />

      <AnimatePresence>
        {creating && <NewSaleModal onClose={() => setCreate(false)} />}
      </AnimatePresence>
    </div>
  )
}
