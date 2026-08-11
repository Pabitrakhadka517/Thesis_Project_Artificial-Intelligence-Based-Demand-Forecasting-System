import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useQuery } from '@tanstack/react-query'
import {
  selectSidebarCollapsed,
  selectSidebarMobileOpen,
  closeMobileSidebar,
} from '@/store/slices/uiSlice'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Package, TrendingUp, Bell,
  Lightbulb, FileText, Settings, User, Zap, X,
  Truck, ShoppingCart, Users, ClipboardList,
  ShieldCheck, Tag, Scale, History,
  UserCog, Briefcase, ShoppingBag, Receipt, Bot,
  Warehouse, BarChart3, Cpu, Database,
} from 'lucide-react'
import { cn } from '@/utils'
import { APP_NAME } from '@/constants'
import { selectUnreadCount } from '@/store/slices/alertSlice'
import { useRole } from '@/hooks/useRole'
import { aiService } from '@/services/aiService'

// ── Role badges ───────────────────────────────────────────────────────────────

const BADGES = {
  admin: {
    label: 'Administrator',
    sublabel: 'Full Access',
    color: '#EF4444',
    bg: 'rgba(239,68,68,.15)',
    icon: ShieldCheck,
  },
  inventory_manager: {
    label: 'Inv. Manager',
    sublabel: 'Operations',
    color: '#8B5CF6',
    bg: 'rgba(139,92,246,.15)',
    icon: UserCog,
  },
  staff: {
    label: 'Staff',
    sublabel: 'Sales & Stock',
    color: '#3B82F6',
    bg: 'rgba(59,130,246,.15)',
    icon: Briefcase,
  },
}

// ── Nav sections ──────────────────────────────────────────────────────────────

// Section shapes are intentionally identical across roles where the same
// concept applies (Transactions, Operations, Analytics, Alerts) so moving
// between role views — or getting promoted — doesn't relearn the layout.
function getAdminSections() {
  return [
    {
      label: 'Overview',
      items: [
        { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      label: 'Catalog',
      items: [
        { to: '/admin/products',       label: 'Products',       icon: Package },
        { to: '/admin/categories',     label: 'Categories',     icon: Tag },
        { to: '/admin/units',          label: 'Units',          icon: Scale },
        { to: '/admin/suppliers',      label: 'Suppliers',      icon: Truck },
      ],
    },
    {
      label: 'Transactions',
      items: [
        { to: '/admin/sales',           label: 'Sales',           icon: ShoppingCart },
        { to: '/admin/purchases',       label: 'Purchases',       icon: ShoppingBag },
        { to: '/admin/inventory',       label: 'Inventory',       icon: Warehouse },
        { to: '/admin/stock-movements', label: 'Stock Movements', icon: History },
      ],
    },
    {
      label: 'Operations',
      items: [
        { to: '/admin/forecasting',    label: 'Forecasting', icon: TrendingUp },
        { to: '/admin/recommendations', label: 'AI Insights', icon: Lightbulb },
      ],
    },
    {
      label: 'Analytics',
      items: [
        { to: '/admin/reports',   label: 'Reports',   icon: FileText },
        { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
        { to: '/admin/models',    label: 'AI Models',  icon: Cpu },
      ],
    },
    {
      label: 'AI Assistant',
      items: [
        { to: '/admin/assistant', label: 'AI Assistant', icon: Bot },
      ],
    },
    {
      label: 'Alerts',
      items: [
        { to: '/admin/alerts', label: 'Alerts', icon: Bell, badge: true },
      ],
    },
    {
      label: 'Administration',
      items: [
        { to: '/admin/users',          label: 'Users & Roles', icon: Users },
        { to: '/admin/audit-logs',     label: 'Audit Logs',    icon: ClipboardList },
        { to: '/admin/synthetic-data', label: 'Synthetic Data', icon: Database },
        { to: '/admin/settings',       label: 'Settings',      icon: Settings },
      ],
    },
  ]
}

function getManagerSections() {
  return [
    {
      label: 'Overview',
      items: [
        { to: '/manager/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      label: 'Catalog',
      items: [
        { to: '/manager/products',   label: 'Products',  icon: Package },
        { to: '/manager/suppliers',  label: 'Suppliers', icon: Truck },
      ],
    },
    {
      label: 'Transactions',
      items: [
        { to: '/manager/sales',     label: 'Sales',     icon: ShoppingCart },
        { to: '/manager/purchases', label: 'Purchases', icon: ShoppingBag },
        { to: '/manager/inventory', label: 'Inventory', icon: Warehouse },
      ],
    },
    {
      label: 'Operations',
      items: [
        { to: '/manager/forecasting',     label: 'Forecasting', icon: TrendingUp },
        { to: '/manager/recommendations', label: 'AI Insights', icon: Lightbulb },
      ],
    },
    {
      label: 'Analytics',
      items: [
        { to: '/manager/reports',   label: 'Reports',   icon: FileText },
        { to: '/manager/analytics', label: 'Analytics', icon: BarChart3 },
        { to: '/manager/models',    label: 'AI Models',  icon: Cpu },
      ],
    },
    {
      label: 'AI Assistant',
      items: [
        { to: '/manager/assistant', label: 'AI Assistant', icon: Bot },
      ],
    },
    {
      label: 'Alerts',
      items: [
        { to: '/manager/alerts', label: 'Alerts', icon: Bell, badge: true },
      ],
    },
  ]
}

function getStaffSections() {
  return [
    {
      label: 'Overview',
      items: [
        { to: '/staff/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      label: 'Daily Tasks',
      items: [
        { to: '/staff/sales',     label: 'Record Sales', icon: Receipt },
        { to: '/staff/inventory', label: 'Inventory',    icon: Warehouse },
      ],
    },
    {
      label: 'AI Assistant',
      items: [
        { to: '/staff/assistant', label: 'AI Assistant', icon: Bot },
      ],
    },
    {
      label: 'Alerts',
      items: [
        { to: '/staff/alerts', label: 'Alerts', icon: Bell, badge: true },
      ],
    },
  ]
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NavItem({ to, label, icon: Icon, collapsed, badge, unread }) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn('sidebar-item', isActive && 'active', collapsed && 'justify-center px-0 py-2.5')
      }
    >
      <span className="relative shrink-0">
        <Icon className="h-4.5 w-4.5" />
        {badge && unread > 0 && collapsed && (
          <span
            className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
            style={{ background: 'var(--brand-red)' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          {badge && unread > 0 && (
            <span
              className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
              style={{ background: 'var(--brand-red)' }}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

function SidebarContent({ collapsed }) {
  const unreadCount = useSelector(selectUnreadCount)
  const { role, isAdmin, isManager, prefix } = useRole()

  const { data: aiHealth, isError: aiHealthError } = useQuery({
    queryKey: ['ai-health'],
    queryFn: () => aiService.getHealth().then(r => r.data?.data),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  })
  const aiOnline = aiHealthError ? false : aiHealth?.online

  const badge      = BADGES[role] || BADGES.staff
  const BadgeIcon  = badge.icon
  const sections   = isAdmin ? getAdminSections() : isManager ? getManagerSections() : getStaffSections()
  const profileItem = { to: `${prefix}/profile`, label: 'Profile', icon: User }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Logo ── */}
      <div
        className={cn(
          'flex items-center gap-3 border-b shrink-0',
          collapsed ? 'justify-center px-0 py-4' : 'px-5 py-4.5'
        )}
        style={{ borderColor: 'rgba(255,255,255,.12)' }}
      >
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'rgba(255,255,255,.18)', boxShadow: 'var(--shadow-sm)' }}
        >
          <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
        </div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <span className="block font-bold text-[15px] tracking-tight leading-none text-white">
                {APP_NAME}
              </span>
              <span className="block text-[10px] mt-0.5 font-medium" style={{ color: 'rgba(255,255,255,.5)' }}>
                Enterprise Analytics
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Role badge ── */}
      {!collapsed && (
        <div className="mx-3 mt-3 mb-1 px-3 py-2 rounded-lg flex items-center gap-2"
          style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.15)' }}>
          <BadgeIcon className="h-3.5 w-3.5 shrink-0" style={{ color: 'rgba(255,255,255,.85)' }} />
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,.85)' }}>
            {badge.label}
          </span>
          <span className="ml-auto text-[10px]" style={{ color: 'rgba(255,255,255,.5)' }}>
            {badge.sublabel}
          </span>
        </div>
      )}

      {/* ── Nav ── */}
      <nav aria-label="Primary" className="flex-1 overflow-y-auto py-2 space-y-3.5"
        style={{ overscrollBehavior: 'contain' }}>
        {sections.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: 'rgba(255,255,255,.38)' }}>
                {section.label}
              </p>
            )}
            {collapsed && (
              <div className="mx-3 mb-2 h-px" style={{ background: 'rgba(255,255,255,.1)' }} />
            )}
            <div className={cn('space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
              {section.items.map((item) => (
                <NavItem key={item.to} {...item} collapsed={collapsed} unread={unreadCount} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Bottom ── */}
      <div className="shrink-0 py-3 space-y-0.5"
        style={{ borderTop: '1px solid rgba(255,255,255,.1)' }}>
        <div className={cn(collapsed ? 'px-2' : 'px-3')}>
          <NavItem {...profileItem} collapsed={collapsed} />
        </div>

        {!collapsed && (
          <div
            className="mx-4 mt-3 px-3 py-2.5 rounded-lg"
            style={{
              background: 'rgba(255,255,255,.07)',
              border: '1px solid rgba(255,255,255,.12)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ background: aiOnline === false ? 'var(--brand-red)' : aiOnline === true ? 'var(--brand-green)' : 'var(--text-muted)' }}
                />
                <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,.7)' }}>
                  {aiOnline === false ? 'AI Engine Offline' : aiOnline === true ? 'AI Engine Online' : 'Checking AI Engine…'}
                </span>
              </div>
              {aiOnline !== undefined && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                  style={
                    aiOnline === false
                      ? { background: 'var(--tint-danger-border)', color: 'var(--brand-red)', letterSpacing: '.04em' }
                      : { background: 'var(--tint-success-border)', color: 'var(--brand-green)', letterSpacing: '.04em' }
                  }
                >
                  {aiOnline === false ? 'OFFLINE' : 'LIVE'}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sidebar (desktop + mobile) ────────────────────────────────────────────────

export function Sidebar() {
  const dispatch   = useDispatch()
  const collapsed  = useSelector(selectSidebarCollapsed)
  const mobileOpen = useSelector(selectSidebarMobileOpen)

  return (
    <>
      {/* Desktop */}
      <motion.aside
        animate={{ width: collapsed ? 68 : 260 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="hidden lg:flex flex-col shrink-0 sidebar-bg"
        style={{ overflow: 'hidden' }}
      >
        <SidebarContent collapsed={collapsed} />
      </motion.aside>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 lg:hidden"
              style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)' }}
              onClick={() => dispatch(closeMobileSidebar())}
            />
            <motion.aside
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed left-0 top-0 bottom-0 z-50 w-64 lg:hidden sidebar-bg"
              style={{ boxShadow: 'var(--shadow-drawer)' }}
            >
              <button
                onClick={() => dispatch(closeMobileSidebar())}
                aria-label="Close menu"
                className="absolute top-4 right-4 h-7 w-7 rounded-md flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.8)' }}
              >
                <X className="h-4 w-4" />
              </button>
              <SidebarContent collapsed={false} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
