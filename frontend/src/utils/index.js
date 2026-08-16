import { clsx } from 'clsx'
import { API_BASE_URL } from '@/constants'

// ── Product image helpers ─────────────────────────────────────────────────────

/**
 * Base URL of the Express backend (where static images are served from).
 * Shares API_BASE_URL's fallback ('' → same-origin via the dev proxy / prod
 * host) so a missing VITE_API_URL doesn't break only images while API calls
 * stay working.
 */
export const BACKEND_URL = API_BASE_URL

const DEFAULT_IMG = `${BACKEND_URL}/product-images/default-product.png`

/**
 * Return the full image URL for a product.
 * Priority: local `image` field → Cloudinary `imageUrl` → default placeholder.
 *
 * @param {object|string|null} productOrPath  Product object or raw path string
 * @returns {string}
 */
export function getProductImage(productOrPath) {
  const raw = typeof productOrPath === 'string'
    ? productOrPath
    : (productOrPath?.image || productOrPath?.imageUrl || '')

  if (!raw) return DEFAULT_IMG
  if (raw.startsWith('http')) return raw      // Absolute URL (Cloudinary etc.)
  return `${BACKEND_URL}${raw}`               // Local path → prepend backend base
}

/**
 * onError handler for <img> tags — silently swaps in the default placeholder.
 * Usage: <img src={...} onError={imgFallback} />
 */
export function imgFallback(e) {
  e.currentTarget.onerror = null
  e.currentTarget.src = DEFAULT_IMG
}
import { twMerge } from 'tailwind-merge'
import { format, parseISO, formatDistanceToNow } from 'date-fns'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value, currency = 'NPR') {
  if (value == null) return '—'
  return new Intl.NumberFormat('ne-NP', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// The app's display convention is "Rs. X" (not the Intl currency-code style
// `formatCurrency` above), optionally abbreviated for large values. Single
// source of truth — was previously redefined with drifting thresholds in
// ProductsPage/SuppliersPage/PurchasesPage/SalesPage.
export function formatRs(value, { abbreviate = true } = {}) {
  const n = Number(value) || 0
  if (abbreviate) {
    if (Math.abs(n) >= 1_000_000) return `Rs. ${(n / 1_000_000).toFixed(1)}M`
    if (Math.abs(n) >= 1_000)     return `Rs. ${(n / 1_000).toFixed(1)}K`
  }
  return `Rs. ${n.toLocaleString()}`
}

// Stock-status color/label map consumed by Products/Inventory/ProductDetail
// pages. Values are derived from constants/statusColors.js (the single
// canonical source, also used by Badge.jsx's StockStatusBadge) rather than
// redefined here, so this and the badge component can't drift apart again.
import { STOCK_STATUS_STYLES } from '@/constants/statusColors'

export const STOCK_STATUS = Object.fromEntries(
  Object.entries(STOCK_STATUS_STYLES).map(([key, s]) => [
    key,
    { label: s.label, color: s.color, bg: s.tint },
  ])
)

export function formatNumber(value, decimals = 0) {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatPercent(value, decimals = 1) {
  if (value == null) return '—'
  return `${Number(value).toFixed(decimals)}%`
}

export function formatDate(date, fmt = 'MMM d, yyyy') {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, fmt)
  } catch {
    return '—'
  }
}

export function formatDateTime(date) {
  return formatDate(date, 'MMM d, yyyy HH:mm')
}

export function formatRelativeTime(date) {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return formatDateTime(date)
  }
}

export function truncate(str, len = 40) {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '…' : str
}

export function getInitials(name = '') {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

export function debounce(fn, delay = 300) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportCSV(data, filename = 'export.csv') {
  if (!data?.length) return
  const headers = Object.keys(data[0])
  const rows = data.map((row) =>
    headers.map((h) => JSON.stringify(row[h] ?? '')).join(',')
  )
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  downloadBlob(blob, filename)
}

export function buildQueryString(params) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.append(k, v)
  })
  return qs.toString()
}

export function classifyStockStatus(current, reorderPoint, safetyStock) {
  if (current <= 0) return 'out_of_stock'
  if (current <= safetyStock) return 'critical'
  if (current <= reorderPoint) return 'low'
  if (current > reorderPoint * 2) return 'overstock'
  return 'healthy'
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// Unit display labels — maps raw DB unit values to human-readable abbreviations
const UNIT_LABELS = {
  kg: 'kg', g: 'g', ton: 'ton', L: 'L', mL: 'mL',
  pcs: 'pcs', pkt: 'pkt', btl: 'btl', can: 'can', jar: 'jar',
  cup: 'cup', carton: 'ctn', bag: 'bag', box: 'box',
  packet: 'pkt', dozen: 'dz', bundle: 'bdl', crate: 'crate',
}

export function formatWithUnit(qty, unit) {
  if (qty == null) return '—'
  const label = (unit && UNIT_LABELS[unit]) || unit || ''
  const formatted = formatNumber(Math.round(qty))
  return label ? `${formatted} ${label}` : formatted
}
