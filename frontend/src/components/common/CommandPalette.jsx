import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, X, LayoutDashboard, Package, TrendingUp, BarChart3, Bell,
  FileText, Settings, Users, Truck, ShoppingCart, Tag, Scale,
  ArrowRight, Lightbulb, ClipboardList, ShoppingBag, Receipt,
  History, Cpu,
} from 'lucide-react'
import { useDispatch } from 'react-redux'
import { setFilters as setInventoryFilters } from '@/store/slices/inventorySlice'
import { useRole } from '@/hooks/useRole'

function buildItems(prefix, isAdmin, isManager, isStaff) {
  const items = []

  // Everyone
  items.push(
    { label: 'Dashboard',  icon: LayoutDashboard, to: `${prefix}/dashboard`, group: 'Navigate' },
    { label: 'Inventory',  icon: Package,         to: `${prefix}/inventory`, group: 'Navigate' },
    { label: 'Alerts',     icon: Bell,            to: `${prefix}/alerts`,    group: 'Navigate' },
  )

  if (isStaff) {
    items.push(
      { label: 'Record Sales', icon: Receipt, to: '/staff/sales', group: 'Navigate' },
    )
  }

  if (isManager || isAdmin) {
    items.push(
      { label: 'Purchases',    icon: ShoppingBag,  to: `${prefix}/purchases`,        group: 'Navigate' },
      { label: 'Sales',        icon: ShoppingCart,  to: `${prefix}/sales`,           group: 'Navigate' },
      { label: 'Forecasting',  icon: TrendingUp,   to: `${prefix}/forecasting`,      group: 'Navigate' },
      { label: 'AI Insights',  icon: Lightbulb,    to: `${prefix}/recommendations`,  group: 'Navigate' },
      { label: 'Analytics',    icon: BarChart3,    to: `${prefix}/analytics`,        group: 'Navigate' },
      { label: 'Reports',      icon: FileText,     to: `${prefix}/reports`,          group: 'Navigate' },
      { label: 'Suppliers',    icon: Truck,        to: `${prefix}/suppliers`,        group: 'Navigate' },
      { label: 'AI Models',    icon: Cpu,          to: `${prefix}/models`,           group: 'Navigate' },
    )
  }

  if (isAdmin) {
    items.push(
      { label: 'Products',       icon: Package,       to: '/admin/products',       group: 'Admin' },
      { label: 'Categories',     icon: Tag,           to: '/admin/categories',     group: 'Admin' },
      { label: 'Units',          icon: Scale,         to: '/admin/units',          group: 'Admin' },
      { label: 'Users & Roles',  icon: Users,         to: '/admin/users',          group: 'Admin' },
      { label: 'Audit Logs',     icon: ClipboardList, to: '/admin/audit-logs',     group: 'Admin' },
      { label: 'Stock Movements',icon: History,       to: '/admin/stock-movements', group: 'Admin' },
      { label: 'Settings',       icon: Settings,      to: '/admin/settings',       group: 'Admin' },
    )
  }

  return items
}

export function CommandPalette({ open, onClose }) {
  const navigate  = useNavigate()
  const dispatch  = useDispatch()
  const { prefix, isAdmin, isManager, isStaff } = useRole()
  const [query,    setQuery]    = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef  = useRef(null)
  const listRef   = useRef(null)

  const allItems = buildItems(prefix, isAdmin, isManager, isStaff)

  const filtered = query.trim()
    ? allItems.filter(item => item.label.toLowerCase().includes(query.toLowerCase()))
    : allItems

  const groupOrder = [...new Set(filtered.map(i => i.group))]

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 40)
    }
  }, [open])

  useEffect(() => { setSelected(0) }, [query])

  const handleSelect = useCallback((item) => {
    navigate(item.to)
    onClose()
  }, [navigate, onClose])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
      if (e.key === 'Enter') {
        e.preventDefault()
        const item = filtered[selected]
        if (item) { handleSelect(item); return }
        // fallback: search products
        const q = query.trim()
        if (q) {
          dispatch(setInventoryFilters({ search: q, page: 1 }))
          navigate(`${prefix}/inventory`)
          onClose()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, filtered, selected, query, handleSelect, dispatch, navigate, prefix, onClose])

  // scroll selected into view
  useEffect(() => {
    listRef.current?.querySelector('[data-sel="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60]"
            style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -10 }}
            transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
            className="fixed left-1/2 -translate-x-1/2 top-[14vh] z-[61] w-full max-w-lg px-4"
          >
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-xl)',
              }}
            >
              {/* Input */}
              <div
                className="flex items-center gap-3 px-4 py-3.5"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <Search className="h-4.5 w-4.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search pages or type a command…"
                  className="flex-1 bg-transparent text-[14px] outline-none"
                  style={{ color: 'var(--text-primary)' }}
                />
                {query ? (
                  <button
                    onClick={() => setQuery('')}
                    className="h-5 w-5 rounded flex items-center justify-center transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <kbd
                    className="px-1.5 py-0.5 rounded text-[10px] border font-mono"
                    style={{
                      color: 'var(--text-muted)',
                      borderColor: 'var(--border)',
                      background: 'var(--surface-muted)',
                    }}
                  >
                    Esc
                  </kbd>
                )}
              </div>

              {/* Results */}
              <div ref={listRef} className="max-h-80 overflow-y-auto py-1.5">
                {filtered.length === 0 ? (
                  <div className="py-10 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
                    No results for "{query}"
                  </div>
                ) : (
                  groupOrder.map(groupName => {
                    const groupItems = filtered.filter(i => i.group === groupName)
                    return (
                      <div key={groupName}>
                        <p
                          className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {groupName}
                        </p>
                        {groupItems.map(item => {
                          const idx = filtered.indexOf(item)
                          const isSel = idx === selected
                          return (
                            <button
                              key={item.to}
                              data-sel={isSel}
                              onClick={() => handleSelect(item)}
                              onMouseEnter={() => setSelected(idx)}
                              className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors"
                              style={{
                                background: isSel ? 'var(--surface-muted)' : 'transparent',
                                color: isSel ? 'var(--text-primary)' : 'var(--text-secondary)',
                              }}
                            >
                              <div
                                className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                                style={{
                                  background: isSel ? 'var(--brand-blue)' : 'var(--surface-muted)',
                                }}
                              >
                                <item.icon
                                  className="h-3.5 w-3.5"
                                  style={{ color: isSel ? 'white' : 'var(--text-muted)' }}
                                />
                              </div>
                              <span className="flex-1 text-[13px] font-medium">{item.label}</span>
                              {isSel && (
                                <ArrowRight
                                  className="h-3.5 w-3.5 shrink-0"
                                  style={{ color: 'var(--brand-blue)' }}
                                />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )
                  })
                )}
              </div>

              {/* Footer */}
              <div
                className="flex items-center gap-4 px-4 py-2.5 text-[11px]"
                style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}
              >
                {[['↑↓', 'navigate'], ['↵', 'select'], ['Esc', 'close']].map(([key, action]) => (
                  <span key={key} className="flex items-center gap-1.5">
                    <kbd
                      className="px-1.5 py-0.5 rounded border text-[10px] font-mono"
                      style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}
                    >
                      {key}
                    </kbd>
                    {action}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
