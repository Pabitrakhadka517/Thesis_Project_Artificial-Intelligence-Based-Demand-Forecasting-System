import { useRef, useState, useEffect, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  Menu, Bell, Sun, Moon, ChevronLeft, ChevronRight,
  Search, X, Command, ChevronRight as Sep,
  LogOut, UserCircle, Settings, CheckCheck,
  AlertTriangle, Info, AlertCircle, Clock,
} from 'lucide-react'
import {
  toggleSidebar,
  toggleMobileSidebar,
  selectSidebarCollapsed,
} from '@/store/slices/uiSlice'
import { setFilters as setInventoryFilters } from '@/store/slices/inventorySlice'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'
import { useRole } from '@/hooks/useRole'
import { getInitials } from '@/utils'
import { selectUnreadCount } from '@/store/slices/alertSlice'
import { alertService } from '@/services/alertService'
import { APP_NAME, MOTION } from '@/constants'
import { ALERT_PRIORITY_STYLES } from '@/constants/statusColors'

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60)   return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)   return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)   return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const SEVERITY_ICON = {
  critical: AlertCircle,
  high:     AlertTriangle,
  medium:   Info,
  low:      Info,
}

const SEGMENT_LABELS = {
  dashboard:       'Dashboard',
  inventory:       'Inventory',
  forecasting:     'Demand Forecasting',
  analytics:       'Analytics',
  alerts:          'Alert Center',
  recommendations: 'AI Insights',
  reports:         'Reports',
  settings:        'Settings',
  profile:         'Profile',
  products:        'Products',
  suppliers:       'Suppliers',
  users:           'Users & Roles',
  models:          'AI Models',
  'audit-logs':    'Audit Logs',
  'sales-data':    'Sales Data',
  'stock-movements': 'Stock Movements',
  'synthetic-data':  'Synthetic Data',
  purchases:       'Purchases',
  sales:           'Sales',
  categories:      'Categories',
  units:           'Units',
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────

function Breadcrumb() {
  const { pathname } = useLocation()
  const segments = pathname.split('/').filter(Boolean)
  const ROLE_LABELS = { admin: 'Admin', manager: 'Manager', staff: 'Staff' }
  const rolePrefix = ROLE_LABELS[segments[0]] || null
  const pageLabel  = SEGMENT_LABELS[segments[1]] || SEGMENT_LABELS[segments[0]] || 'Page'
  const dashboardTo = segments[0] ? `/${segments[0]}/dashboard` : '/'
  const crumbStyle = {
    color: 'var(--text-muted)',
    transition: 'color .12s',
  }
  return (
    <div className="hidden sm:flex items-center gap-1.5 text-sm min-w-0">
      <Link
        to={dashboardTo}
        style={crumbStyle}
        className="shrink-0"
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
      >
        {APP_NAME}
      </Link>
      {rolePrefix && (
        <>
          <Sep className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
          <Link
            to={dashboardTo}
            style={crumbStyle}
            className="shrink-0"
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            {rolePrefix}
          </Link>
        </>
      )}
      <Sep className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
      <span className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{pageLabel}</span>
    </div>
  )
}

// ── Notification Popover ──────────────────────────────────────────────────────

function NotificationPopover({ open, onClose, alertsPath }) {
  const ref = useRef(null)

  const { data: alertsRes, isLoading } = useQuery({
    queryKey: ['alerts-preview'],
    queryFn:  () => alertService.getAlerts({ limit: 5, page: 1 }),
    enabled:  open,
    staleTime: 30_000,
  })

  const alerts = alertsRes?.data?.data ?? []

  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0,  scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.97 }}
          transition={{ duration: MOTION.fast, ease: MOTION.ease }}
          className="absolute right-0 top-full mt-2 w-80 rounded-xl z-50"
          style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              Notifications
            </span>
            <button
              onClick={() => alertService.markAllRead().catch(() => {})}
              className="flex items-center gap-1 text-[11px] transition-colors"
              style={{ color: 'var(--brand-blue)' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '.7'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          </div>

          {/* List */}
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3">
                  <div className="skeleton h-7 w-7 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-3 w-3/4 rounded" />
                    <div className="skeleton h-2.5 w-1/2 rounded" />
                  </div>
                </div>
              ))
            ) : alerts.length === 0 ? (
              <div className="py-8 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
                No recent alerts
              </div>
            ) : (
              alerts.map(alert => {
                const Icon = SEVERITY_ICON[alert.priority] || SEVERITY_ICON.medium
                const { color, tint } = ALERT_PRIORITY_STYLES[alert.priority] || ALERT_PRIORITY_STYLES.medium
                return (
                  <Link
                    key={alert._id}
                    to={`${alertsPath}`}
                    onClick={onClose}
                    className="flex items-start gap-3 px-4 py-3 transition-colors"
                    style={{ opacity: alert.isRead ? 0.6 : 1 }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div
                      className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: tint }}
                    >
                      <Icon className="h-3.5 w-3.5" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {alert.title}
                      </p>
                      <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                        {alert.message}
                      </p>
                      <p className="flex items-center gap-1 text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        <Clock className="h-3 w-3" />
                        {timeAgo(alert.createdAt)}
                      </p>
                    </div>
                    {!alert.isRead && (
                      <div className="h-2 w-2 rounded-full mt-1.5 shrink-0" style={{ background: 'var(--brand-blue)' }} />
                    )}
                  </Link>
                )
              })
            )}
          </div>

          {/* Footer */}
          <Link
            to={alertsPath}
            onClick={onClose}
            className="flex items-center justify-center py-3 text-[12px] font-medium transition-colors"
            style={{
              borderTop: '1px solid var(--border)',
              color: 'var(--brand-blue)',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            View all alerts
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── User Dropdown ─────────────────────────────────────────────────────────────

function UserDropdown({ open, onClose, user, profilePath, settingsPath, isAdmin, logout }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open, onClose])

  const ROLE_LABELS = {
    admin:             'Administrator',
    inventory_manager: 'Inventory Manager',
    staff:             'Staff',
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0,  scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.97 }}
          transition={{ duration: MOTION.fast, ease: MOTION.ease }}
          className="absolute right-0 top-full mt-2 w-56 rounded-xl z-50"
          style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {/* User header */}
          <div className="px-4 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {user?.fullName || 'User'}
            </p>
            <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {user?.email}
            </p>
            <span
              className="inline-flex items-center mt-2 px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{
                background: 'var(--tint-primary)',
                color: 'var(--brand-blue)',
                border: '1px solid var(--tint-primary-border)',
              }}
            >
              {ROLE_LABELS[user?.role] || user?.role}
            </span>
          </div>

          {/* Links */}
          <div className="py-1.5">
            <Link
              to={profilePath}
              onClick={onClose}
              className="flex items-center gap-2.5 px-4 py-2 text-[13px] transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              <UserCircle className="h-4 w-4 shrink-0" />
              Profile
            </Link>
            {(isAdmin) && (
              <Link
                to={settingsPath}
                onClick={onClose}
                className="flex items-center gap-2.5 px-4 py-2 text-[13px] transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
              >
                <Settings className="h-4 w-4 shrink-0" />
                Settings
              </Link>
            )}
          </div>

          {/* Logout */}
          <div style={{ borderTop: '1px solid var(--border)' }} className="py-1.5">
            <button
              onClick={() => { onClose(); logout() }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] transition-colors"
              style={{ color: 'var(--color-danger)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--tint-danger)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sign out
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Navbar ────────────────────────────────────────────────────────────────────

export function Navbar({ onOpenCommandPalette }) {
  const dispatch    = useDispatch()
  const navigate    = useNavigate()
  const { isDark, toggle } = useTheme()
  const { user, logout }   = useAuth()
  const collapsed   = useSelector(selectSidebarCollapsed)
  const unreadCount = useSelector(selectUnreadCount)
  const { prefix, isAdmin } = useRole()

  const alertsPath   = `${prefix}/alerts`
  const profilePath  = `${prefix}/profile`
  const settingsPath = '/admin/settings'
  const inventoryPath = `${prefix}/inventory`

  const [query,       setQuery]       = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [notifOpen,   setNotifOpen]   = useState(false)
  const [userDropOpen, setUserDropOpen] = useState(false)

  const inputRef   = useRef(null)
  const bellRef    = useRef(null)
  const avatarRef  = useRef(null)

  // '/' focuses search; Escape blurs it
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === '/' &&
        e.target.tagName !== 'INPUT' &&
        e.target.tagName !== 'TEXTAREA') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape') {
        inputRef.current?.blur()
        setQuery('')
        setNotifOpen(false)
        setUserDropOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function handleSearch(e) {
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    dispatch(setInventoryFilters({ search: trimmed, page: 1 }))
    navigate(inventoryPath)
    inputRef.current?.blur()
    setQuery('')
  }

  const closeNotif    = useCallback(() => setNotifOpen(false),    [])
  const closeUserDrop = useCallback(() => setUserDropOpen(false), [])

  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-3 px-4 h-16"
      style={{
        background: 'var(--surface-navbar)',
        borderBottom: '1px solid var(--border)',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      {/* Mobile menu */}
      <button
        onClick={() => dispatch(toggleMobileSidebar())}
        className="lg:hidden h-9 w-9 rounded-lg flex items-center justify-center transition-colors"
        style={{ color: 'var(--text-secondary)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Desktop collapse toggle */}
      <button
        onClick={() => dispatch(toggleSidebar())}
        className="hidden lg:flex h-9 w-9 rounded-lg items-center justify-center transition-colors"
        style={{ color: 'var(--text-secondary)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        aria-label="Toggle sidebar"
      >
        {collapsed ? <ChevronRight className="h-4.5 w-4.5" /> : <ChevronLeft className="h-4.5 w-4.5" />}
      </button>

      <Breadcrumb />

      {/* Command palette trigger — the search form below (and its ⌘K hint) is
          hidden under sm:/lg:, so this is the only way to reach the palette
          on tablet/mobile. */}
      <button
        onClick={onOpenCommandPalette}
        className="sm:hidden h-9 w-9 rounded-lg flex items-center justify-center transition-colors"
        style={{ color: 'var(--text-secondary)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        aria-label="Search (Ctrl+K)"
      >
        <Search className="h-4.5 w-4.5" />
      </button>

      {/* Search */}
      <form
        onSubmit={handleSearch}
        className="flex-1 max-w-sm hidden sm:flex items-center gap-2 rounded-lg px-3 h-9 transition-all"
        style={{
          background: searchFocused ? 'var(--surface-card)' : 'var(--surface-muted)',
          border: `1px solid ${searchFocused ? 'var(--brand-blue)' : 'var(--border)'}`,
          boxShadow: searchFocused ? 'var(--focus-ring)' : 'none',
        }}
      >
        <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          placeholder="Search products…"
          className="flex-1 bg-transparent text-[13px] outline-none min-w-0"
          style={{ color: 'var(--text-primary)' }}
        />
        {query ? (
          <button
            type="button" onClick={() => setQuery('')}
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono border"
            style={{ color: 'var(--text-muted)', borderColor: 'var(--border)', background: 'var(--surface-muted)' }}>
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        )}
      </form>

      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="h-9 w-9 rounded-lg flex items-center justify-center transition-all"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          title={isDark ? 'Light mode' : 'Dark mode'}
          aria-label="Toggle theme"
        >
          <span className="flex items-center justify-center">
            {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
          </span>
        </button>

        {/* Notification bell */}
        <div ref={bellRef} className="relative">
          <button
            onClick={() => { setNotifOpen(v => !v); setUserDropOpen(false) }}
            className="relative h-9 w-9 rounded-lg flex items-center justify-center transition-colors"
            style={{
              color: 'var(--text-secondary)',
              background: notifOpen ? 'var(--surface-muted)' : 'transparent',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
            onMouseLeave={e => { if (!notifOpen) e.currentTarget.style.background = 'transparent' }}
            aria-label="Notifications"
          >
            <Bell className="h-4.5 w-4.5" />
            <AnimatePresence>
              {unreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                  className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ background: 'var(--brand-red)' }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
          <NotificationPopover
            open={notifOpen}
            onClose={closeNotif}
            alertsPath={alertsPath}
          />
        </div>

        {/* Divider */}
        <div className="h-6 w-px mx-1" style={{ background: 'var(--border)' }} />

        {/* User avatar + dropdown */}
        <div ref={avatarRef} className="relative">
          <button
            onClick={() => { setUserDropOpen(v => !v); setNotifOpen(false) }}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors"
            style={{ background: userDropOpen ? 'var(--surface-muted)' : 'transparent' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
            onMouseLeave={e => { if (!userDropOpen) e.currentTarget.style.background = 'transparent' }}
            aria-label="User menu"
          >
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-[13px] font-semibold text-white shrink-0"
              style={{ background: 'var(--brand-primary)' }}
            >
              {getInitials(user?.fullName || user?.email || 'U')}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-[13px] font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>
                {user?.fullName?.split(' ')[0] || 'User'}
              </p>
              <p className="text-[11px] mt-0.5 leading-none truncate max-w-28" style={{ color: 'var(--text-muted)' }}>
                {user?.role || 'Admin'}
              </p>
            </div>
          </button>
          <UserDropdown
            open={userDropOpen}
            onClose={closeUserDrop}
            user={user}
            profilePath={profilePath}
            settingsPath={settingsPath}
            isAdmin={isAdmin}
            logout={logout}
          />
        </div>
      </div>
    </header>
  )
}
