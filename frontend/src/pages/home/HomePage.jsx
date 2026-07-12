import { useRef, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, useMotionValue, animate, AnimatePresence } from 'framer-motion'
import {
  TrendingUp, Package, BarChart3, Bell, Lightbulb, ShieldCheck,
  ArrowRight, ChevronRight, ChevronDown, Zap, Brain, Database, Code2,
  Users, Eye, CheckCircle, LineChart, AlertTriangle, DollarSign,
  Target, Upload, Cpu, Layers, Activity, Menu, X as XIcon,
  TrendingDown, LayoutDashboard, FlaskConical, Globe,
  GraduationCap, MapPin, Shield, Clock, Sun, Moon,
} from 'lucide-react'
import { APP_NAME } from '@/constants'
import { useTheme } from '@/hooks/useTheme'

// ─── Design tokens — mapped onto the app's CSS variables so the landing
// page follows the same light/dark toggle as the dashboard instead of
// carrying its own frozen light palette. Semantic accent colors (blue,
// green, amber, etc.) stay fixed hex — they read fine on both surfaces,
// matching how the dashboard treats status/brand colors. ────────────────
const T = {
  page:        'var(--surface-page)',
  pageMid:     'var(--surface-muted)',
  card:        'var(--surface-card)',
  cardMid:     'var(--surface-muted)',
  muted:       'var(--surface-muted)',
  hover:       '#EFF6FF',
  sidebarBg:   'var(--surface-muted)',
  border:      'var(--border)',
  borderFaint: 'var(--border-subtle)',
  blue:        '#2563EB',
  blueLight:   '#3B82F6',
  blueMid:     'rgba(37,99,235,.1)',
  purple:      '#8B5CF6',
  green:       '#16A34A',
  amber:       '#D97706',
  red:         '#DC2626',
  cyan:        '#0891B2',
  indigo:      '#4F46E5',
  text:        'var(--text-primary)',
  textSub:     'var(--text-secondary)',
  textMuted:   'var(--text-muted)',
  textFaint:   'var(--text-muted)',
}

// ─── Animation helpers ────────────────────────────────────────────────────────
const ease = [0.22, 1, 0.36, 1]
const fadeUp = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease } },
}
const stagger = { visible: { transition: { staggerChildren: 0.08 } } }

function Reveal({ children, className = '', from = 'bottom', delay = 0 }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-50px' })
  const vars = from === 'left'
    ? { hidden: { opacity: 0, x: -24 }, visible: { opacity: 1, x: 0, transition: { duration: 0.55, ease } } }
    : from === 'right'
    ? { hidden: { opacity: 0, x: 24  }, visible: { opacity: 1, x: 0, transition: { duration: 0.55, ease } } }
    : fadeUp
  return (
    <motion.div ref={ref} initial="hidden" animate={inView ? 'visible' : 'hidden'}
      variants={vars} transition={{ delay }} className={className}>
      {children}
    </motion.div>
  )
}

function Grid({ children, className = '' }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-50px' })
  return (
    <motion.div ref={ref} initial="hidden" animate={inView ? 'visible' : 'hidden'}
      variants={stagger} className={className}>
      {children}
    </motion.div>
  )
}

function Counter({ to, suffix = '', prefix = '', duration = 1.6 }) {
  const ref    = useRef(null)
  const inView = useInView(ref, { once: true })
  const val    = useMotionValue(0)
  const [display, setDisplay] = useState('0')
  useEffect(() => {
    if (!inView) return
    const ctrl = animate(val, to, {
      duration, ease: 'easeOut',
      onUpdate: v => setDisplay(Number.isInteger(to) ? Math.round(v).toString() : v.toFixed(1)),
    })
    return ctrl.stop
  }, [inView, to, duration, val])
  return <span ref={ref}>{prefix}{display}{suffix}</span>
}

// ─── Reusable small components ────────────────────────────────────────────────

// Plain uppercase label — no pill, no border, no background. A colored
// gradient badge repeated on every section reads as templated; a section
// label doesn't need a container to do its job.
function Tag({ children, color = T.blue }) {
  return (
    <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color }}>
      {children}
    </span>
  )
}

// Solid brand color instead of a blue→purple gradient clip-text effect —
// that gradient-headline treatment is one of the most recognizable
// AI-generated-website signatures, so it's gone in favor of one confident color.
function BlueText({ children }) {
  // T.blue (not brand-primary) — brand-primary darkens for dark-mode
  // surfaces, which makes it unreadable used as text on a dark page.
  return <span style={{ color: T.blue }}>{children}</span>
}

const glassCard = {
  background:   T.card,
  border:       `1px solid ${T.border}`,
  borderRadius: 12,
  boxShadow:    'var(--shadow-sm)',
  transition:   'box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease',
}
const glassHover = {
  boxShadow:   'var(--shadow-md), 0 8px 24px rgba(37,99,235,.1)',
  borderColor: 'rgba(37,99,235,.25)',
  transform:   'translateY(-2px)',
}
const glassReset = {
  boxShadow:   'var(--shadow-sm)',
  borderColor: T.border,
  transform:   'translateY(0)',
}

// ─── App Mockup — updated to match the white FlowStock UI ────────────────────
function AppMockup() {
  const BAR  = [38, 52, 42, 68, 55, 72, 48, 65, 78, 58, 70, 62]
  const LINE = [32, 44, 36, 58, 48, 64, 42, 60, 72, 54, 66, 70]
  const W = 264, H = 64
  const linePoints = LINE.map((v, i) => `${(i / (LINE.length - 1)) * W},${H - (v / 80) * H}`).join(' ')

  return (
    <div className="relative select-none" style={{ maxWidth: 540, margin: '0 auto' }}>
      <div className="relative rounded-xl overflow-hidden"
        style={{ background: '#FFFFFF', border: `1px solid rgba(37,99,235,.2)`,
          boxShadow: `0 24px 64px rgba(0,0,0,.1), 0 4px 12px rgba(0,0,0,.06)` }}>

        {/* Browser chrome */}
        <div className="flex items-center gap-2 px-4 py-2.5"
          style={{ background: '#F9FAFB', borderBottom: `1px solid #E5E7EB` }}>
          <div className="flex gap-1.5">
            {['#EF4444','#F59E0B','#22C55E'].map(c => (
              <div key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
            ))}
          </div>
          <div className="flex-1 mx-3 px-3 py-1 rounded flex items-center gap-1.5"
            style={{ background: '#FFFFFF', border: `1px solid #E5E7EB` }}>
            <div className="h-1.5 w-1.5 rounded-full" style={{ background: '#16A34A' }} />
            <span className="text-[9px]" style={{ color: '#6B7280' }}>stockwise.app/admin/dashboard</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: '#16A34A' }} />
            <span className="text-[8px] font-bold" style={{ color: '#16A34A' }}>LIVE</span>
          </div>
        </div>

        {/* Layout — sidebar + main */}
        <div style={{ display: 'grid', gridTemplateColumns: '144px 1fr' }}>

          {/* Sidebar — white */}
          <div style={{ background: '#FFFFFF', borderRight: `1px solid #E5E7EB`, padding: '10px 0' }}>
            <div style={{ padding: '0 10px 8px', borderBottom: `1px solid #E5E7EB`, marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px rgba(3,4,94,.35)' }}>
                  <Zap style={{ width: 10, height: 10, color: '#fff', strokeWidth: 2.5 }} />
                </div>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#111827', display: 'block', lineHeight: 1.1 }}>StockWise</span>
                  <span style={{ fontSize: 7, color: '#9CA3AF' }}>Enterprise</span>
                </div>
              </div>
            </div>

            {/* Role badge */}
            <div style={{ margin: '0 8px 6px', padding: '4px 7px', borderRadius: 6, background: 'rgba(217,119,6,.1)', border: '1px solid rgba(217,119,6,.2)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#D97706' }} />
              <span style={{ fontSize: 7.5, fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inv. Manager</span>
            </div>

            {/* Nav items */}
            {[
              { label: 'Dashboard',   active: true  },
              { label: 'Inventory',   active: false },
              { label: 'Forecasting', active: false },
              { label: 'AI Insights', active: false },
              { label: 'Alerts',      active: false },
              { label: 'Reports',     active: false },
            ].map(({ label, active }) => (
              <div key={label} style={{ margin: '0 8px 1px', padding: '5px 7px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 5,
                background: active ? 'rgba(37,99,235,.08)' : 'transparent' }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: active ? '#2563EB' : '#D1D5DB' }} />
                <span style={{ fontSize: 8.5, color: active ? '#2563EB' : '#6B7280', fontWeight: active ? 600 : 400 }}>{label}</span>
              </div>
            ))}

            {/* AI Engine status */}
            <div style={{ margin: '8px 8px 0', padding: '5px 7px', borderRadius: 6, background: 'rgba(37,99,235,.06)', border: '1px solid rgba(37,99,235,.15)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#16A34A' }} />
                <span style={{ fontSize: 7.5, color: '#374151' }}>AI Engine Online</span>
                <span style={{ marginLeft: 'auto', fontSize: 6.5, background: 'rgba(22,163,74,.12)', color: '#16A34A', padding: '1px 4px', borderRadius: 10, fontWeight: 700 }}>LIVE</span>
              </div>
            </div>
          </div>

          {/* Main content */}
          <div style={{ padding: '10px', background: '#F3F4F6' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#111827' }}>Dashboard</span>
              <div style={{ display: 'flex', gap: 3 }}>
                {['Today','7d','30d'].map((t, i) => (
                  <div key={t} style={{ padding: '2px 5px', borderRadius: 4, fontSize: 7.5, fontWeight: i === 0 ? 600 : 400,
                    background: i === 0 ? 'rgba(37,99,235,.1)' : '#FFFFFF',
                    color: i === 0 ? '#2563EB' : '#6B7280',
                    border: i === 0 ? 'none' : '1px solid #E5E7EB' }}>{t}</div>
                ))}
              </div>
            </div>

            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, marginBottom: 7 }}>
              {[
                { l:'Accuracy',  v:'94.2%', d:'↑2.1%',  c:'#16A34A' },
                { l:'Stock Val', v:'₨2.4M', d:'12 SKU',  c:'#2563EB' },
                { l:'Low Stock', v:'8 items',d:'3 crit', c:'#D97706' },
                { l:'Revenue',   v:'₨850K', d:'↑12.5%', c:'#2563EB' },
              ].map(({ l, v, d, c }) => (
                <div key={l} style={{ padding: '5px 6px', background: '#FFFFFF', border: `1px solid #E5E7EB`, borderRadius: 6 }}>
                  <div style={{ fontSize: 7, color: '#9CA3AF', marginBottom: 1 }}>{l}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#111827' }}>{v}</div>
                  <div style={{ fontSize: 7, color: c, marginTop: 1 }}>{d}</div>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div style={{ background: '#FFFFFF', border: `1px solid #E5E7EB`, borderRadius: 6, padding: '6px 8px', marginBottom: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 8, fontWeight: 600, color: '#374151' }}>Demand Forecast vs Actual</span>
                <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 3, background: 'rgba(37,99,235,.1)', color: '#2563EB' }}>Prophet</span>
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 52 }}>
                <defs>
                  <linearGradient id="hg1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.blue} stopOpacity="0.2" />
                    <stop offset="100%" stopColor={T.blue} stopOpacity="0" />
                  </linearGradient>
                </defs>
                {BAR.map((v, i) => {
                  const bw = (W / BAR.length) * 0.5
                  const bx = (i / BAR.length) * W + bw * 0.5
                  return <rect key={i} x={bx} y={H - (v / 80) * H} width={bw} height={(v / 80) * H}
                    fill="rgba(37,99,235,.12)" rx="1.5" />
                })}
                <polygon points={`0,${H} ${linePoints} ${W},${H}`} fill="url(#hg1)" />
                <polyline points={linePoints} fill="none" stroke={T.blue} strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </div>

            {/* Bottom panels */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {[
                { title:'Active Alerts',       items:[['Basmati Rice low','#DC2626'],['Wheat critical','#D97706'],['EOQ triggered','#D97706']] },
                { title:'AI Recommendations',  items:[['Order 240u Basmati','#16A34A'],['EOQ: 180kg Wheat','#2563EB'],['Reduce Lentil 20%','#D97706']] },
              ].map(({ title, items }) => (
                <div key={title} style={{ background: '#FFFFFF', border: `1px solid #E5E7EB`, borderRadius: 5, padding: '5px 6px' }}>
                  <div style={{ fontSize: 7.5, fontWeight: 600, color: '#374151', marginBottom: 3 }}>{title}</div>
                  {items.map(([txt, c]) => (
                    <div key={txt} style={{ display: 'flex', alignItems: 'center', gap: 3.5, marginBottom: 2.5 }}>
                      <div style={{ width: 4.5, height: 4.5, borderRadius: '50%', background: c, flexShrink: 0 }} />
                      <span style={{ fontSize: 7.5, color: '#6B7280' }}>{txt}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function ThemeToggle({ className = '' }) {
  const { isDark, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      className={`h-9 w-9 rounded-lg flex items-center justify-center transition-colors ${className}`}
      style={{ color: T.textMuted }}
      onMouseEnter={e => { e.currentTarget.style.background = T.muted; e.currentTarget.style.color = T.text }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textMuted }}
      title={isDark ? 'Light mode' : 'Dark mode'}
      aria-label="Toggle theme"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isDark ? 'sun' : 'moon'}
          initial={{ rotate: -90, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          exit={{ rotate: 90, opacity: 0 }}
          transition={{ duration: .15 }}
          className="flex items-center justify-center"
        >
          {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}

function Navbar() {
  const [scrolled, setScrolled]     = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const LINKS = [
    { label: 'Features',     href: '#features'   },
    { label: 'How It Works', href: '#workflow'    },
    { label: 'Technology',   href: '#technology'  },
    { label: 'User Roles',   href: '#roles'       },
  ]

  const navBase = {
    background:     scrolled
      ? 'color-mix(in srgb, var(--surface-navbar) 97%, transparent)'
      : 'color-mix(in srgb, var(--surface-navbar) 92%, transparent)',
    backdropFilter: 'blur(20px)',
    borderBottom:   scrolled ? `1px solid ${T.border}` : '1px solid transparent',
    boxShadow:      scrolled ? '0 1px 12px rgba(0,0,0,.06)' : 'none',
    transition:     'all 0.2s ease',
  }

  return (
    <>
      <motion.header initial={{ y: -64, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease }}
        className="fixed top-0 inset-x-0 z-50"
        style={navBase}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--brand-primary)', boxShadow: '0 3px 10px rgba(3,4,94,.4)' }}>
              <Zap className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-[15px] tracking-tight" style={{ color: T.text }}>{APP_NAME}</span>
          </div>

          {/* Desktop links */}
          <nav className="hidden lg:flex items-center gap-0.5">
            {LINKS.map(({ label, href }) => (
              <a key={label} href={href}
                className="px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all"
                style={{ color: T.textMuted }}
                onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = T.muted }}
                onMouseLeave={e => { e.currentTarget.style.color = T.textMuted; e.currentTarget.style.background = 'transparent' }}>
                {label}
              </a>
            ))}
          </nav>

          {/* CTA */}
          <div className="hidden sm:flex items-center gap-2">
            <ThemeToggle />
            <Link to="/login"
              className="flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-lg text-white"
              style={{ background: 'var(--brand-primary)', boxShadow: '0 2px 10px rgba(3,4,94,.4)' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 18px rgba(3,4,94,.4)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 10px rgba(3,4,94,.4)'}>
              Sign In <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="flex items-center gap-1 sm:hidden">
            <ThemeToggle />
            <button className="p-1.5 rounded-lg" style={{ color: T.textMuted }}
              onClick={() => setMobileOpen(v => !v)}>
              {mobileOpen ? <XIcon className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          <button className="hidden sm:block lg:hidden p-1.5 rounded-lg" style={{ color: T.textMuted }}
            onClick={() => setMobileOpen(v => !v)}>
            {mobileOpen ? <XIcon className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </motion.header>

      {/* Mobile menu */}
      {mobileOpen && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="fixed top-14 inset-x-0 z-40 p-4 shadow-lg"
          style={{ background: T.card, borderBottom: `1px solid ${T.border}` }}>
          <div className="space-y-0.5 mb-4">
            {LINKS.map(({ label, href }) => (
              <a key={label} href={href} onClick={() => setMobileOpen(false)}
                className="block px-4 py-2.5 rounded-lg text-[13px] font-medium"
                style={{ color: T.textMuted }}>
                {label}
              </a>
            ))}
          </div>
          <div className="pt-3" style={{ borderTop: `1px solid ${T.border}` }}>
            <Link to="/login" onClick={() => setMobileOpen(false)}
              className="block text-center py-2.5 rounded-lg text-[13px] font-semibold text-white"
              style={{ background: 'var(--brand-primary)' }}>Sign In to Dashboard</Link>
          </div>
        </motion.div>
      )}
    </>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function HeroSection() {
  return (
    <section className="relative overflow-hidden" style={{ background: T.page, paddingTop: 56 }}>
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* Left */}
          <div>
            <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="text-[11px] font-bold uppercase tracking-widest mb-4"
              style={{ color: T.blue }}>
              Built for Nepal's Wholesale Market
            </motion.p>

            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.07, ease }}
              className="font-extrabold tracking-tight leading-[1.1] mb-5"
              style={{ fontSize: 'clamp(34px, 5vw, 54px)', color: T.text }}>
              AI-Powered Inventory<br />
              Intelligence for{' '}
              <BlueText>Nepal's</BlueText><br />
              <BlueText>Wholesale Market</BlueText>
            </motion.h1>

            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15, ease }}
              className="text-[15px] leading-relaxed mb-8 max-w-lg"
              style={{ color: T.textMuted }}>
              Predict demand, prevent stockouts, and optimize inventory using
              Prophet, LSTM, and Random Forest — purpose-built for wholesale
              and retail stores in Kathmandu Valley.
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.22, ease }}
              className="flex flex-wrap gap-3 mb-10">
              <Link to="/login"
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: 'var(--brand-primary)', boxShadow: '0 2px 14px rgba(3,4,94,.4)' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 22px rgba(3,4,94,.4)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 14px rgba(3,4,94,.4)'}>
                Sign In to Dashboard <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#features"
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-[13px] font-semibold border transition-all"
                style={{ color: T.textMuted, borderColor: T.border, background: 'transparent' }}
                onMouseEnter={e => { e.currentTarget.style.background = T.muted; e.currentTarget.style.color = T.text }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textMuted }}>
                Explore Features <ChevronDown className="h-4 w-4" />
              </a>
            </motion.div>

            {/* Stats */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="flex flex-wrap items-center gap-6 pt-5"
              style={{ borderTop: `1px solid ${T.border}` }}>
              {[
                { val: 94.2, suffix: '%', label: 'Forecast Accuracy', color: T.green     },
                { val: 3,    suffix: '',  label: 'ML Models Active',  color: T.blueLight },
                { val: 85,   suffix: '%', label: 'Fewer Stockouts',   color: T.cyan      },
              ].map(({ val, suffix, label, color }) => (
                <div key={label}>
                  <p className="text-xl font-extrabold" style={{ color }}>
                    <Counter to={val} suffix={suffix} />
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: T.textFaint }}>{label}</p>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right — mockup */}
          <motion.div initial={{ opacity: 0, x: 32 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.12, ease }}>
            <AppMockup />
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// ─── Features ─────────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: TrendingUp,      title: 'Demand Forecasting',      color: T.blueLight,
    desc: 'Prophet, LSTM, and Random Forest models predict demand with 94.2% accuracy for every SKU — updated daily.' },
  { icon: Package,         title: 'Inventory Optimization',  color: T.green,
    desc: 'Dynamic reorder points, EOQ models, and safety stock calculations prevent both stockouts and overstock.' },
  { icon: Lightbulb,       title: 'AI Recommendations',      color: T.amber,
    desc: 'Prioritized, actionable purchase recommendations generated automatically from ML forecasts.' },
  { icon: AlertTriangle,   title: 'Stockout Alerts',         color: T.red,
    desc: 'Proactive alerts fire 5+ days before stock hits critical levels so you can reorder in time.' },
  { icon: BarChart3,       title: 'Business Analytics',      color: T.cyan,
    desc: 'Interactive charts surface sales trends, seasonal patterns, and product performance insights.' },
  { icon: LayoutDashboard, title: 'Role-Aware Dashboards',   color: T.purple,
    desc: 'Admins, managers, and viewers each get a tailored dashboard with precisely the controls they need.' },
]

function FeaturesSection() {
  return (
    <section id="features" className="py-16 lg:py-20"
      style={{ background: T.pageMid }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-12">
          <Tag color={T.blueLight}>Features</Tag>
          <h2 className="font-extrabold tracking-tight mt-4 mb-4" style={{ fontSize: 'clamp(26px,4vw,38px)', color: T.text }}>
            Everything to <BlueText>master inventory</BlueText>
          </h2>
          <p className="text-[14px] max-w-xl mx-auto" style={{ color: T.textMuted }}>
            A complete AI-powered platform that turns raw sales data into intelligent, profit-maximising decisions.
          </p>
        </Reveal>

        <Grid className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc, color }) => (
            <motion.div key={title} variants={fadeUp}
              className="rounded-xl p-6" style={{ ...glassCard }}
              onMouseEnter={e => Object.assign(e.currentTarget.style, glassHover)}
              onMouseLeave={e => Object.assign(e.currentTarget.style, glassReset)}>
              <div className="h-10 w-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: `${color}14` }}>
                <Icon className="h-5 w-5" style={{ color }} />
              </div>
              <h3 className="font-semibold mb-2" style={{ fontSize: 15, color: T.text }}>{title}</h3>
              <p className="text-[13px] leading-relaxed" style={{ color: T.textMuted }}>{desc}</p>
            </motion.div>
          ))}
        </Grid>
      </div>
    </section>
  )
}

// ─── How It Works ─────────────────────────────────────────────────────────────
const STEPS = [
  { icon: Upload,    num:'01', title:'Upload Sales Data',      color: T.blue,
    desc: 'Import historical CSV/XLSX with automatic date parsing, error detection, and multi-product batch support.' },
  { icon: Brain,     num:'02', title:'AI Model Training',      color: T.purple,
    desc: 'Prophet, LSTM, and Random Forest compete on your data and produce the most accurate forecast per SKU.' },
  { icon: Cpu,       num:'03', title:'Inventory Optimization', color: T.cyan,
    desc: 'The engine computes optimal reorder points, EOQ, and safety stock using forecasted demand and lead times.' },
  { icon: Lightbulb, num:'04', title:'Smart Recommendations',  color: T.amber,
    desc: 'Clear, prioritised recommendations — what to order, when, and how much — surfaced automatically.' },
  { icon: BarChart3, num:'05', title:'BI Insights',            color: T.green,
    desc: 'Role-aware dashboards translate ML outputs into KPIs, trend charts, and strategic insights.' },
]

function WorkflowSection() {
  return (
    <section id="workflow" className="py-16 lg:py-20" style={{ background: T.page }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-14">
          <Tag color={T.purple}>Workflow</Tag>
          <h2 className="font-extrabold tracking-tight mt-4 mb-4" style={{ fontSize: 'clamp(26px,4vw,38px)', color: T.text }}>
            From data to <BlueText>decisions in 5 steps</BlueText>
          </h2>
          <p className="text-[14px] max-w-lg mx-auto" style={{ color: T.textMuted }}>
            A fully automated pipeline — zero manual forecasting, zero guesswork.
          </p>
        </Reveal>

        {/* Desktop horizontal steps */}
        <div className="hidden lg:block relative">
          <div className="absolute top-8 left-[10%] right-[10%] h-px"
            style={{ background: `linear-gradient(90deg,${T.border},rgba(37,99,235,.25),${T.border})` }} />
          <Grid className="grid grid-cols-5 gap-4">
            {STEPS.map(({ icon: Icon, num, title, desc, color }) => (
              <motion.div key={num} variants={fadeUp} className="flex flex-col items-center text-center">
                <div className="relative z-10 h-16 w-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: T.card, border: `1px solid ${color}25`, boxShadow: `0 4px 16px rgba(0,0,0,.06)` }}>
                  <Icon className="h-7 w-7" style={{ color }} />
                  <div className="absolute -top-2 -right-2 h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                    style={{ background: color }}>{num}</div>
                </div>
                <h3 className="font-semibold text-[13px] mb-2" style={{ color: T.text }}>{title}</h3>
                <p className="text-[12px] leading-relaxed" style={{ color: T.textMuted }}>{desc}</p>
              </motion.div>
            ))}
          </Grid>
        </div>

        {/* Mobile vertical list */}
        <div className="lg:hidden space-y-3">
          {STEPS.map(({ icon: Icon, num, title, desc, color }) => (
            <Reveal key={num}>
              <div className="flex gap-4 rounded-xl p-5" style={{ ...glassCard }}>
                <div className="relative h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${color}10`, border: `1px solid ${color}20` }}>
                  <Icon className="h-5 w-5" style={{ color }} />
                  <div className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                    style={{ background: color }}>{num}</div>
                </div>
                <div>
                  <h3 className="font-semibold text-[14px] mb-1" style={{ color: T.text }}>{title}</h3>
                  <p className="text-[12.5px] leading-relaxed" style={{ color: T.textMuted }}>{desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Metrics ──────────────────────────────────────────────────────────────────
function MetricsSection() {
  const STATS = [
    { val:94.2, suffix:'%',  label:'Forecast Accuracy',      sub:'Best-in-class ML ensemble',     color: T.green     },
    { val:85,   suffix:'%',  label:'Fewer Stockouts',         sub:'Proactive alerts 5+ days early', color: T.blueLight },
    { val:40,   suffix:'%',  label:'Holding Cost Reduction',  sub:'Via EOQ & safety stock models',  color: T.amber     },
    { val:10,   suffix:'×',  label:'Faster Decisions',        sub:'From days to seconds with AI',   color: T.cyan      },
  ]
  return (
    <section className="py-16 lg:py-20" style={{ background: T.pageMid }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-12">
          <Tag color={T.green}>Impact</Tag>
          <h2 className="font-extrabold tracking-tight mt-4 mb-4" style={{ fontSize: 'clamp(26px,4vw,38px)', color: T.text }}>
            <BlueText>Measurable results</BlueText> for your business
          </h2>
          <p className="text-[14px] max-w-lg mx-auto" style={{ color: T.textMuted }}>
            StockWise delivers quantifiable improvements across every key inventory metric.
          </p>
        </Reveal>

        <Grid className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STATS.map(({ val, suffix, label, sub, color }) => (
            <motion.div key={label} variants={fadeUp}
              className="rounded-xl p-6 text-center"
              style={{ ...glassCard }}>
              <p className="text-4xl font-extrabold mb-2" style={{ color }}>
                <Counter to={val} suffix={suffix} />
              </p>
              <p className="font-semibold text-[14px] mb-1" style={{ color: T.text }}>{label}</p>
              <p className="text-[11.5px]" style={{ color: T.textFaint }}>{sub}</p>
            </motion.div>
          ))}
        </Grid>
      </div>
    </section>
  )
}

// ─── Technology ───────────────────────────────────────────────────────────────
const TECH = [
  { category:'Frontend',         color: T.blueLight,
    items:['React.js 18','Tailwind CSS','Framer Motion','TanStack Query','Redux Toolkit','Recharts'] },
  { category:'Backend API',      color: T.green,
    items:['Node.js','Express.js','JWT Auth','Mongoose ODM','REST API','Express Validator'] },
  { category:'AI Service',       color: T.purple,
    items:['FastAPI','Python 3.11','Prophet','LSTM (Keras)','Random Forest','Scikit-learn'] },
  { category:'Database & Infra', color: T.cyan,
    items:['MongoDB','Motor (Async)','Aggregation Pipeline','Pandas','NumPy','Docker'] },
]

function TechSection() {
  return (
    <section id="technology" className="py-16 lg:py-20" style={{ background: T.page }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-12">
          <Tag color={T.cyan}>Technology</Tag>
          <h2 className="font-extrabold tracking-tight mt-4 mb-4" style={{ fontSize: 'clamp(26px,4vw,38px)', color: T.text }}>
            Built on a <BlueText>modern, proven stack</BlueText>
          </h2>
          <p className="text-[14px] max-w-lg mx-auto" style={{ color: T.textMuted }}>
            Industry-standard technologies chosen for performance, scalability, and ML capability.
          </p>
        </Reveal>

        <Grid className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TECH.map(({ category, color, items }) => (
            <motion.div key={category} variants={fadeUp}
              className="rounded-xl p-5" style={{ ...glassCard }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-2 w-2 rounded-full" style={{ background: color }} />
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>{category}</span>
              </div>
              <div className="space-y-2">
                {items.map(item => (
                  <div key={item} className="flex items-center gap-2.5">
                    <div className="h-1 w-1 rounded-full shrink-0" style={{ background: T.border }} />
                    <span className="text-[12.5px]" style={{ color: T.textMuted }}>{item}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </Grid>
      </div>
    </section>
  )
}

// ─── User Roles ───────────────────────────────────────────────────────────────
const ROLES = [
  { icon: ShieldCheck, title:'Admin',             badge:'Full Access',  color: T.red,
    desc:'Complete system control — manage users, products, AI models, audit logs, and all analytics.',
    perms:['Create & manage user accounts','Product, category & unit management','Train & configure AI models','Full analytics & audit logs','System settings & configuration','Access all reports & dashboards'] },
  { icon: Users,       title:'Inventory Manager', badge:'Operational',  color: T.amber, featured: true,
    desc:'Day-to-day inventory operations powered by AI recommendations and real-time alerts.',
    perms:['Manage stock & adjustments','Record purchases & sales','Execute AI recommendations','Monitor alerts & reorder points','View demand forecasts & analytics','Access movement history & reports'] },
  { icon: Eye,         title:'Staff',             badge:'Sales & Stock', color: T.green,
    desc:'Sales recording and inventory browsing — the front-line operational role for shop staff.',
    perms:['Record and manage sales','Browse inventory & stock levels','View low-stock alerts','Monitor product catalog','Access personal profile','No configuration access'] },
]

function RolesSection() {
  return (
    <section id="roles" className="py-16 lg:py-20" style={{ background: T.pageMid }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-12">
          <Tag color={T.amber}>Access Control</Tag>
          <h2 className="font-extrabold tracking-tight mt-4 mb-4" style={{ fontSize: 'clamp(26px,4vw,38px)', color: T.text }}>
            Designed for <BlueText>every stakeholder</BlueText>
          </h2>
          <p className="text-[14px] max-w-lg mx-auto" style={{ color: T.textMuted }}>
            Role-based access ensures each user sees exactly what they need — and nothing they shouldn't.
          </p>
        </Reveal>

        <Grid className="grid md:grid-cols-3 gap-5">
          {ROLES.map(({ icon: Icon, title, badge, color, desc, perms, featured }) => (
            <motion.div key={title} variants={fadeUp}
              className="rounded-xl p-6 flex flex-col"
              style={featured
                ? { ...glassCard, borderColor: `${color}35`, boxShadow: `0 4px 24px ${color}12, 0 1px 3px rgba(0,0,0,.06)` }
                : glassCard}>
              <div className="flex items-start gap-3 mb-4">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${color}12` }}>
                  <Icon className="h-5 w-5" style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-[15px]" style={{ color: T.text }}>{title}</h3>
                    {featured && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold text-white"
                        style={{ background: color }}>Most Used</span>
                    )}
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block mt-1"
                    style={{ background: `${color}12`, color }}>{badge}</span>
                </div>
              </div>

              <p className="text-[13px] leading-relaxed mb-5" style={{ color: T.textMuted }}>{desc}</p>

              <ul className="space-y-2 flex-1 mb-5">
                {perms.map(p => (
                  <li key={p} className="flex items-start gap-2 text-[12.5px]" style={{ color: T.textMuted }}>
                    <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color }} />
                    {p}
                  </li>
                ))}
              </ul>

              <Link to="/login"
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12.5px] font-semibold transition-all border"
                style={{ color, borderColor: `${color}25`, background: `${color}08` }}
                onMouseEnter={e => e.currentTarget.style.background = `${color}18`}
                onMouseLeave={e => e.currentTarget.style.background = `${color}08`}>
                Sign In <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </motion.div>
          ))}
        </Grid>
      </div>
    </section>
  )
}

// ─── About strip ─────────────────────────────────────────────────────────────
function AboutStrip() {
  return (
    <section className="py-10" style={{ background: T.page, borderTop: `1px solid ${T.border}` }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="rounded-xl p-5 lg:p-7" style={{ ...glassCard, background: T.pageMid }}>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { icon: GraduationCap, label:'Institution',   val:'Pokhara University',       color: T.blueLight },
                { icon: Target,        label:'Project Type',  val:'Final Year Thesis · 2025', color: T.purple    },
                { icon: Globe,         label:'Target Market', val:'Kathmandu Valley, Nepal',  color: T.cyan      },
                { icon: MapPin,        label:'Developer',     val:'Aayush Acharya',           color: T.green     },
              ].map(({ icon: Icon, label, val, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${color}12` }}>
                    <Icon className="h-4 w-4" style={{ color }} />
                  </div>
                  <div>
                    <p className="text-[10px]" style={{ color: T.textFaint }}>{label}</p>
                    <p className="text-[13px] font-semibold" style={{ color: T.text }}>{val}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ─── CTA ─────────────────────────────────────────────────────────────────────
function CTASection() {
  return (
    <section className="py-16 lg:py-20" style={{ background: T.pageMid }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="rounded-2xl p-10 lg:p-16 text-center"
            style={{ background: 'rgba(37,99,235,.06)', border: `1px solid rgba(37,99,235,.18)` }}>
            <div className="relative z-10">
              <Tag color={T.blue}>Ready to get started?</Tag>
              <h2 className="font-extrabold tracking-tight mt-5 mb-4" style={{ fontSize: 'clamp(26px,4vw,38px)', color: T.text }}>
                Optimize your inventory<br />
                <BlueText>with AI intelligence today</BlueText>
              </h2>
              <p className="text-[14px] mb-8 max-w-md mx-auto" style={{ color: T.textMuted }}>
                Access your workspace and start making data-driven inventory decisions.
                No guesswork — just intelligent, actionable insights.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
                <Link to="/login"
                  className="flex items-center gap-2 px-7 py-3.5 rounded-xl text-[13px] font-bold text-white"
                  style={{ background: 'var(--brand-primary)', boxShadow: '0 4px 18px rgba(3,4,94,.45)' }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 28px rgba(3,4,94,.45)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 18px rgba(3,4,94,.45)'}>
                  Sign In to Dashboard <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-6 pt-6"
                style={{ borderTop: `1px solid ${T.border}` }}>
                {[
                  { icon: Shield,    text:'Role-based Security' },
                  { icon: Clock,     text:'Real-time Alerts'    },
                  { icon: Brain,     text:'3 ML Algorithms'     },
                  { icon: Globe,     text:'Built for Nepal'     },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-1.5 text-[11.5px]" style={{ color: T.textFaint }}>
                    <Icon className="h-3.5 w-3.5" />
                    {text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer style={{ background: T.page, borderTop: `1px solid ${T.border}` }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-7 w-7 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--brand-primary)', boxShadow: '0 3px 10px rgba(3,4,94,.35)' }}>
                <Zap className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
              </div>
              <span className="font-bold text-[15px]" style={{ color: T.text }}>{APP_NAME}</span>
            </div>
            <p className="text-[12.5px] leading-relaxed mb-4" style={{ color: T.textFaint }}>
              AI-Based Demand Forecasting and Inventory Optimization for wholesale and retail stores in Kathmandu Valley.
            </p>
            <a href="mailto:aayushmaacharya51@gmail.com"
              className="text-[12.5px]" style={{ color: T.blue }}
              onMouseEnter={e => e.target.style.color = T.blueLight}
              onMouseLeave={e => e.target.style.color = T.blue}>
              aayushmaacharya51@gmail.com
            </a>
          </div>

          {/* Links columns */}
          {[
            { heading:'Navigate', links:[{ label:'Features', href:'#features' },{ label:'How It Works', href:'#workflow' },{ label:'Technology', href:'#technology' },{ label:'User Roles', href:'#roles' }] },
            { heading:'Platform', links:[{ label:'Sign In', to:'/login' },{ label:'Admin Setup', to:'/setup' }] },
            { heading:'Project',  links:[{ label:'Pokhara University' },{ label:'Final Year Thesis · 2025' },{ label:'Developer: Aayush Acharya' }] },
          ].map(({ heading, links }) => (
            <div key={heading}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: T.border }}>{heading}</p>
              <ul className="space-y-2.5">
                {links.map(({ label, to, href }) => (
                  <li key={label}>
                    {to ? (
                      <Link to={to} className="text-[12.5px]" style={{ color: T.textFaint }}
                        onMouseEnter={e => e.target.style.color = T.text}
                        onMouseLeave={e => e.target.style.color = T.textFaint}>{label}</Link>
                    ) : href ? (
                      <a href={href} className="text-[12.5px]" style={{ color: T.textFaint }}
                        onMouseEnter={e => e.target.style.color = T.text}
                        onMouseLeave={e => e.target.style.color = T.textFaint}>{label}</a>
                    ) : (
                      <span className="text-[12.5px]" style={{ color: T.textFaint }}>{label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="h-px mb-6" style={{ background: T.border }} />
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11.5px]" style={{ color: T.textFaint }}>© {year} {APP_NAME}. All rights reserved.</p>
          <p className="text-[11.5px]" style={{ color: T.textFaint }}>React · FastAPI · MongoDB · Prophet · LSTM · Random Forest</p>
        </div>
      </div>
    </footer>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <div style={{ fontFamily:"'Inter','SF Pro Text',system-ui,sans-serif", overflowX:'hidden' }}>
      <Navbar />
      <main>
        <HeroSection />
        <FeaturesSection />
        <WorkflowSection />
        <MetricsSection />
        <TechSection />
        <RolesSection />
        <AboutStrip />
        <CTASection />
      </main>
      <Footer />
    </div>
  )
}
