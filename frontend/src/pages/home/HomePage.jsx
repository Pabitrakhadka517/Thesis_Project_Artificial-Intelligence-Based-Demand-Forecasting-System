import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  TrendingUp, Package, BarChart3, Lightbulb, ShieldCheck,
  ArrowRight, ChevronRight, ChevronDown, Zap, Brain,
  Users, Eye, CheckCircle,
  Target, Upload, Cpu, Menu, X as XIcon,
  Globe, GraduationCap, MapPin, Shield, Clock, Sun, Moon,
  Store, Wheat, Sparkles, ArrowDownRight, ArrowUpRight,
  CalendarClock, Truck, RefreshCw, PackageCheck,
} from 'lucide-react'
import { APP_NAME, MOTION } from '@/constants'
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
  border:      'var(--border)',
  borderFaint: 'var(--border-subtle)',
  navy:        'var(--brand-primary)',
  blue:        '#2563EB',
  blueLight:   '#3B82F6',
  purple:      '#8B5CF6',
  green:       '#16A34A',
  amber:       '#D97706',
  red:         '#DC2626',
  cyan:        '#0891B2',
  indigo:      '#4F46E5',
  text:        'var(--text-primary)',
  textSub:     'var(--text-secondary)',
  textMuted:   'var(--text-muted)',
}

// ─── Layout helpers (previously scroll-triggered entrance animations —
// simplified to plain wrappers; content renders immediately). ─────────────────
function Reveal({ children, className = '' }) {
  return <div className={className}>{children}</div>
}

function Grid({ children, className = '' }) {
  return <div className={className}>{children}</div>
}

function Counter({ to, suffix = '', prefix = '' }) {
  return <span>{prefix}{to}{suffix}</span>
}

// ─── Reusable small components ────────────────────────────────────────────────

function Tag({ children, color = T.blue }) {
  return (
    <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color }}>
      {children}
    </span>
  )
}

function BlueText({ children }) {
  return <span style={{ color: T.blue }}>{children}</span>
}

// Section heading with an `align` prop so sections don't all read as the
// same centered eyebrow+h2+p template repeated top to bottom.
function SectionHeading({ tag, tagColor, title, desc, align = 'center', action }) {
  const isCenter = align === 'center'
  return (
    <div className={isCenter ? 'text-center mb-12' : 'mb-10 flex flex-wrap items-end justify-between gap-6'}>
      <div className={isCenter ? '' : 'max-w-xl'}>
        <Tag color={tagColor}>{tag}</Tag>
        <h2 className="font-extrabold tracking-tight mt-3 mb-3" style={{ fontSize: 'clamp(26px,4vw,38px)', color: T.text, textWrap: 'balance' }}>
          {title}
        </h2>
        {desc && <p className={`text-[14px] leading-relaxed ${isCenter ? 'max-w-xl mx-auto' : ''}`} style={{ color: T.textMuted }}>{desc}</p>}
      </div>
      {action && !isCenter && <div className="shrink-0">{action}</div>}
    </div>
  )
}

const glassCard = {
  background:   T.card,
  border:       `1px solid ${T.border}`,
  borderRadius: 14,
  boxShadow:    'var(--shadow-sm)',
  transition:   'box-shadow 0.2s ease, border-color 0.2s ease',
}
const glassHover = {
  boxShadow:   'var(--shadow-md)',
  borderColor: 'color-mix(in srgb, var(--brand-blue) 25%, transparent)',
}
const glassReset = {
  boxShadow:   'var(--shadow-sm)',
  borderColor: T.border,
}

// Faint dot-grid texture — a restrained alternative to the gradient-blob
// background every AI-generated hero seems to reach for.
function DotGrid({ opacity = 0.5 }) {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{
      opacity,
      backgroundImage: 'radial-gradient(circle, color-mix(in srgb, var(--text-muted) 35%, transparent) 1px, transparent 1px)',
      backgroundSize: '22px 22px',
      maskImage: 'radial-gradient(ellipse 70% 60% at 70% 30%, black 0%, transparent 75%)',
      WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 70% 30%, black 0%, transparent 75%)',
    }} />
  )
}

// Tiny inline sparkline used inside feature/use-case cards — no chart
// library needed for a 100×32 decoration.
function MiniSparkline({ points, color, width = 108, height = 32 }) {
  const max = Math.max(...points), min = Math.min(...points)
  const norm = points.map((v, i) => {
    const x = (i / (points.length - 1)) * width
    const y = height - ((v - min) / (max - min || 1)) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={norm} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width} cy={norm.split(' ').pop().split(',')[1]} r="2.5" fill={color} />
    </svg>
  )
}

// ─── App Mockup — hand-built product screenshot for the hero, not a stock
// photo or generic dashboard clipart. Colors intentionally fixed/light —
// a screenshot doesn't re-theme with the page around it. ──────────────────
function AppMockup() {
  const BAR  = [38, 52, 42, 68, 55, 72, 48, 65, 78, 58, 70, 62]
  const LINE = [32, 44, 36, 58, 48, 64, 42, 60, 72, 54, 66, 70]
  const W = 264, H = 64
  const linePoints = LINE.map((v, i) => `${(i / (LINE.length - 1)) * W},${H - (v / 80) * H}`).join(' ')

  return (
    <div className="relative select-none" style={{ maxWidth: 540, margin: '0 auto' }}>
      <div className="relative rounded-xl overflow-hidden"
        style={{ background: '#FFFFFF', border: `1px solid rgba(37,99,235,.2)`,
          boxShadow: `0 24px 64px rgba(0,0,0,.12), 0 4px 12px rgba(0,0,0,.06)` }}>

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
            <div className="h-1.5 w-1.5 rounded-full" style={{ background: '#16A34A' }} />
            <span className="text-[8px] font-bold" style={{ color: '#16A34A' }}>LIVE</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '144px 1fr' }}>
          <div style={{ background: '#FFFFFF', borderRight: `1px solid #E5E7EB`, padding: '10px 0' }}>
            <div style={{ padding: '0 10px 8px', borderBottom: `1px solid #E5E7EB`, marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: '#03045E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap style={{ width: 10, height: 10, color: '#fff', strokeWidth: 2.5 }} />
                </div>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#111827', display: 'block', lineHeight: 1.1 }}>StockWise</span>
                  <span style={{ fontSize: 7, color: '#9CA3AF' }}>Enterprise</span>
                </div>
              </div>
            </div>
            <div style={{ margin: '0 8px 6px', padding: '4px 7px', borderRadius: 6, background: 'rgba(217,119,6,.1)', border: '1px solid rgba(217,119,6,.2)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#D97706' }} />
              <span style={{ fontSize: 7.5, fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inv. Manager</span>
            </div>
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
            <div style={{ margin: '8px 8px 0', padding: '5px 7px', borderRadius: 6, background: 'rgba(37,99,235,.06)', border: '1px solid rgba(37,99,235,.15)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#16A34A' }} />
                <span style={{ fontSize: 7.5, color: '#374151' }}>AI Engine Online</span>
                <span style={{ marginLeft: 'auto', fontSize: 6.5, background: 'rgba(22,163,74,.12)', color: '#16A34A', padding: '1px 4px', borderRadius: 10, fontWeight: 700 }}>LIVE</span>
              </div>
            </div>
          </div>

          <div style={{ padding: '10px', background: '#F3F4F6' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, marginBottom: 7 }}>
              {[
                { l:'Accuracy',  v:'94.2%', d:'↑2.1%',  c:'#16A34A' },
                { l:'Stock Val', v:'Rs. 2.4M', d:'12 SKU',  c:'#2563EB' },
                { l:'Low Stock', v:'8 items',d:'3 crit', c:'#D97706' },
                { l:'Revenue',   v:'Rs. 850K', d:'↑12.5%', c:'#2563EB' },
              ].map(({ l, v, d, c }) => (
                <div key={l} style={{ padding: '5px 6px', background: '#FFFFFF', border: `1px solid #E5E7EB`, borderRadius: 6 }}>
                  <div style={{ fontSize: 7, color: '#9CA3AF', marginBottom: 1 }}>{l}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#111827' }}>{v}</div>
                  <div style={{ fontSize: 7, color: c, marginTop: 1 }}>{d}</div>
                </div>
              ))}
            </div>
            <div style={{ background: '#FFFFFF', border: `1px solid #E5E7EB`, borderRadius: 6, padding: '6px 8px', marginBottom: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 8, fontWeight: 600, color: '#374151' }}>Demand Forecast vs Actual</span>
                <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 3, background: 'rgba(37,99,235,.1)', color: '#2563EB' }}>Prophet</span>
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 52 }}>
                <defs>
                  <linearGradient id="hg1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {BAR.map((v, i) => {
                  const bw = (W / BAR.length) * 0.5
                  const bx = (i / BAR.length) * W + bw * 0.5
                  return <rect key={i} x={bx} y={H - (v / 80) * H} width={bw} height={(v / 80) * H}
                    fill="rgba(37,99,235,.12)" rx="1.5" />
                })}
                <polygon points={`0,${H} ${linePoints} ${W},${H}`} fill="url(#hg1)" />
                <polyline points={linePoints} fill="none" stroke="#2563EB" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </div>
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

      {/* Floating stat chip — small "proof" detail overlapping the mockup,
          a common premium-SaaS device that adds depth without a gradient blob. */}
      <div
        className="absolute -left-6 -bottom-5 hidden sm:flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl"
        style={{ background: T.card, border: `1px solid ${T.border}`, boxShadow: 'var(--shadow-lg)' }}>
        <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(22,163,74,.12)' }}>
          <ArrowDownRight className="h-4 w-4" style={{ color: T.green }} />
        </div>
        <div>
          <p className="text-[13px] font-bold leading-none" style={{ color: T.text }}>Reorder point crossed</p>
          <p className="text-[10.5px] mt-1" style={{ color: T.textMuted }}>Purchase order suggested automatically</p>
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
      onMouseEnter={e => { e.currentTarget.style.background = T.pageMid; e.currentTarget.style.color = T.text }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textMuted }}
      title={isDark ? 'Light mode' : 'Dark mode'}
      aria-label="Toggle theme"
    >
      <span className="flex items-center justify-center">
        {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
      </span>
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
    { label: 'Features',    href: '#features'   },
    { label: 'How It Works', href: '#workflow'   },
    { label: 'Use Cases',   href: '#use-cases'   },
    { label: 'User Roles',  href: '#roles'       },
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
      <header
        className="fixed top-0 inset-x-0 z-50"
        style={navBase}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--brand-primary)' }}>
              <Zap className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-[15px] tracking-tight" style={{ color: T.text }}>{APP_NAME}</span>
          </div>

          <nav className="hidden lg:flex items-center gap-0.5">
            {LINKS.map(({ label, href }) => (
              <a key={label} href={href}
                className="px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all"
                style={{ color: T.textMuted }}
                onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = T.pageMid }}
                onMouseLeave={e => { e.currentTarget.style.color = T.textMuted; e.currentTarget.style.background = 'transparent' }}>
                {label}
              </a>
            ))}
          </nav>

          <div className="hidden sm:flex items-center gap-2">
            <ThemeToggle />
            <Link to="/login"
              className="flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-lg text-white"
              style={{ background: 'var(--brand-primary)' }}>
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
      </header>

      <AnimatePresence>
        {mobileOpen && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          transition={{ duration: MOTION.fast, ease: MOTION.ease }}
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
      </AnimatePresence>
    </>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function HeroSection() {
  return (
    <section className="relative overflow-hidden" style={{ background: T.page, paddingTop: 56 }}>
      <DotGrid />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          <div>
            <p
              className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest mb-5"
              style={{ color: T.blue }}>
              <Sparkles className="h-3 w-3" /> AI Demand Forecasting for Wholesale Grocery
            </p>

            <h1
              className="font-extrabold tracking-tight leading-[1.08] mb-5"
              style={{ fontSize: 'clamp(36px, 5vw, 58px)', color: T.text, textWrap: 'balance' }}>
              Never run out.<br /><BlueText>Never overstock.</BlueText>
            </h1>

            <p
              className="text-[15.5px] leading-relaxed mb-8 max-w-lg"
              style={{ color: T.textMuted }}>
              Purpose-built for wholesale grocery stores in Kathmandu Valley. Prophet,
              LSTM, and Random Forest models turn your sales history into purchase
              decisions — so shelves stay full without tying up cash in stock that
              won't move.
            </p>

            <div className="flex flex-wrap gap-3 mb-10">
              <Link to="/login"
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: 'var(--brand-primary)' }}>
                Sign In to Dashboard <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#workflow"
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-[13px] font-semibold border transition-all"
                style={{ color: T.textMuted, borderColor: T.border, background: 'transparent' }}
                onMouseEnter={e => { e.currentTarget.style.background = T.pageMid; e.currentTarget.style.color = T.text }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textMuted }}>
                See How It Works <ChevronDown className="h-4 w-4" />
              </a>
            </div>

            <div
              className="flex flex-wrap items-center gap-6 pt-5"
              style={{ borderTop: `1px solid ${T.border}` }}>
              {[
                { val: 3,  suffix: '',  label: 'ML models per SKU', color: T.blueLight },
                { val: 5,  suffix: '+', label: 'Days early warning', color: T.green     },
                { val: 20, suffix: '+', label: 'Wholesale grocery SKUs modeled', color: T.cyan },
              ].map(({ val, suffix, label, color }) => (
                <div key={label}>
                  <p className="text-xl font-extrabold" style={{ color }}>
                    <Counter to={val} suffix={suffix} />
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: T.textMuted }}>{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <AppMockup />
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Features — the six capabilities called out in the brief, each with a
// small bespoke visual instead of a repeated icon-in-a-box. ──────────────────
function FeatureVisual({ kind }) {
  if (kind === 'forecast') return (
    <MiniSparkline points={[40, 52, 46, 61, 55, 70, 64, 80]} color={T.blue} />
  )
  if (kind === 'optimize') return (
    <div className="flex h-3 w-full rounded-full overflow-hidden">
      <div style={{ width: '18%', background: T.red }} title="Safety stock" />
      <div style={{ width: '32%', background: T.amber }} title="Reorder buffer" />
      <div style={{ width: '50%', background: T.green }} title="Available" />
    </div>
  )
  if (kind === 'stockout') return (
    <div className="flex items-end gap-2 h-8">
      <div className="flex flex-col items-center gap-1">
        <div className="w-4 rounded-t" style={{ height: 10, background: T.red }} />
        <span className="text-[8px]" style={{ color: T.textMuted }}>Before</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className="w-4 rounded-t" style={{ height: 28, background: T.green }} />
        <span className="text-[8px]" style={{ color: T.textMuted }}>After</span>
      </div>
    </div>
  )
  if (kind === 'catalog') return (
    <div className="flex flex-wrap gap-1.5">
      {['Rice', 'Dal', 'Oil', 'Spices'].map(c => (
        <span key={c} className="text-[9.5px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(217,119,6,.1)', color: T.amber }}>{c}</span>
      ))}
    </div>
  )
  if (kind === 'analytics') return (
    <div className="flex items-end gap-1 h-8">
      {[14, 22, 17, 28, 20, 26].map((h, i) => (
        <div key={i} className="w-2 rounded-t" style={{ height: h, background: i === 3 ? T.cyan : 'color-mix(in srgb, ' + T.cyan + ' 35%, transparent)' }} />
      ))}
    </div>
  )
  if (kind === 'recommend') return (
    <div className="text-[10.5px] font-semibold px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5"
      style={{ background: 'rgba(22,163,74,.1)', color: T.green }}>
      <PackageCheck className="h-3 w-3" /> Order 75 units · Rs 6,375
    </div>
  )
  return null
}

const FEATURES = [
  { icon: TrendingUp, visual: 'forecast',  title: 'AI-Based Demand Forecasting', color: T.blue,
    desc: 'Prophet, LSTM, and Random Forest models predict daily demand per SKU from your own sales history — not a generic industry average.' },
  { icon: Package,    visual: 'optimize',  title: 'Inventory Optimization',      color: T.green,
    desc: 'Reorder points, EOQ, and safety stock are recalculated automatically as demand shifts, balancing order cost against holding cost.' },
  { icon: ShieldCheck,visual: 'stockout',  title: 'Stockout Reduction',          color: T.red,
    desc: 'Alerts fire days before a SKU is projected to hit zero — enough runway to place an order and receive it in time.' },
  { icon: Store,      visual: 'catalog',   title: 'Wholesale Grocery Management',color: T.amber,
    desc: 'Products, categories, units, suppliers, purchases, and sales in one system built around how a Nepali wholesale grocer actually operates.' },
  { icon: BarChart3,  visual: 'analytics', title: 'Business Analytics',          color: T.cyan,
    desc: 'Sales trends, category performance, supplier reliability, and inventory health — one dashboard per role, not a spreadsheet export.' },
  { icon: Lightbulb,  visual: 'recommend', title: 'Smart Purchase Recommendations', color: T.purple,
    desc: 'Ranked, ready-to-act suggestions — what to order, how much, from which supplier, and what it will cost.' },
]

function FeaturesSection() {
  return (
    <section id="features" className="py-16 lg:py-20" style={{ background: T.pageMid }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          align="left"
          tag="What StockWise Does"
          tagColor={T.blueLight}
          title={<>Six capabilities, one <BlueText>wholesale grocery workflow</BlueText></>}
          desc="Everything a Kathmandu Valley wholesale grocer needs to turn sales history into stocking decisions — built as one connected system, not six separate tools."
        />

        <Grid className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, visual, title, desc, color }) => (
            <div key={title}
              className="rounded-xl p-6 flex flex-col" style={{ ...glassCard }}
              onMouseEnter={e => Object.assign(e.currentTarget.style, glassHover)}
              onMouseLeave={e => Object.assign(e.currentTarget.style, glassReset)}>
              <div className="h-10 w-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
                <Icon className="h-5 w-5" style={{ color }} />
              </div>
              <h3 className="font-semibold mb-2" style={{ fontSize: 15, color: T.text }}>{title}</h3>
              <p className="text-[13px] leading-relaxed mb-4 flex-1" style={{ color: T.textMuted }}>{desc}</p>
              <div className="pt-3" style={{ borderTop: `1px solid ${T.borderFaint}` }}>
                <FeatureVisual kind={visual} />
              </div>
            </div>
          ))}
        </Grid>
      </div>
    </section>
  )
}

// ─── Business Workflow — a real connected pipeline with an artifact
// preview per stage, not five identical numbered circles. ────────────────────
const STAGES = [
  { icon: Upload, title: 'Sales Data',   color: T.blue,
    preview: ['Basmati Rice · 12 units', 'Mustard Oil · 8 units', 'White Sugar · 20 units'] },
  { icon: Brain,  title: 'AI Forecast',  color: T.purple,
    sparkline: [40, 46, 42, 58, 52, 66, 60, 74] },
  { icon: Cpu,    title: 'Optimization', color: T.cyan,
    chips: ['ROP · 340u', 'EOQ · 210u', 'Safety · 90u'] },
  { icon: Lightbulb, title: 'Recommendation', color: T.amber,
    chip: 'Order 75 units · Rs 6,375' },
  { icon: ShieldCheck, title: 'Stockout Prevented', color: T.green,
    stat: 'Stock never hit zero' },
]

function WorkflowSection() {
  return (
    <section id="workflow" className="py-16 lg:py-20" style={{ background: T.page }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          tag="How It Works"
          tagColor={T.purple}
          title={<>From sales history to a <BlueText>reorder decision</BlueText></>}
          desc="A single automated pipeline — every stage below runs without manual forecasting or spreadsheet math."
        />

        {/* Desktop */}
        <div className="hidden lg:grid grid-cols-5 gap-3 items-stretch">
          {STAGES.map(({ icon: Icon, title, color, preview, sparkline, chips, chip, stat }, i) => (
            <Reveal key={title} delay={i * 0.07} className="relative flex flex-col">
              {i < STAGES.length - 1 && (
                <div className="absolute top-6 -right-4 z-10 hidden lg:flex items-center justify-center"
                  style={{ width: 24 }}>
                  <ChevronRight className="h-4 w-4" style={{ color: T.border }} />
                </div>
              )}
              <div className="rounded-xl p-4 flex-1 flex flex-col" style={glassCard}>
                <div className="h-9 w-9 rounded-lg flex items-center justify-center mb-3"
                  style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
                  <Icon className="h-4.5 w-4.5" style={{ color }} />
                </div>
                <h3 className="font-semibold text-[12.5px] mb-2.5" style={{ color: T.text }}>{title}</h3>
                <div className="mt-auto pt-2">
                  {preview && (
                    <div className="space-y-1">
                      {preview.map(p => (
                        <div key={p} className="text-[9.5px] px-1.5 py-1 rounded" style={{ background: T.pageMid, color: T.textMuted }}>{p}</div>
                      ))}
                    </div>
                  )}
                  {sparkline && <MiniSparkline points={sparkline} color={color} width={100} height={28} />}
                  {chips && (
                    <div className="flex flex-wrap gap-1">
                      {chips.map(c => (
                        <span key={c} className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>{c}</span>
                      ))}
                    </div>
                  )}
                  {chip && (
                    <span className="text-[9.5px] font-semibold px-2 py-1 rounded-md inline-block"
                      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>{chip}</span>
                  )}
                  {stat && (
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color }}>
                      <CheckCircle className="h-3 w-3" /> {stat}
                    </div>
                  )}
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Mobile */}
        <div className="lg:hidden space-y-3">
          {STAGES.map(({ icon: Icon, title, color, preview, chips, chip, stat }, i) => (
            <Reveal key={title}>
              <div className="flex gap-4 rounded-xl p-5" style={glassCard}>
                <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
                  <Icon className="h-5 w-5" style={{ color }} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-[14px] mb-1.5" style={{ color: T.text }}>{title}</h3>
                  {preview && <p className="text-[11.5px]" style={{ color: T.textMuted }}>{preview.join(' · ')}</p>}
                  {chips && <p className="text-[11.5px]" style={{ color: T.textMuted }}>{chips.join(' · ')}</p>}
                  {chip && <p className="text-[11.5px] font-medium" style={{ color }}>{chip}</p>}
                  {stat && <p className="text-[11.5px] font-medium" style={{ color }}>{stat}</p>}
                </div>
              </div>
              {i < STAGES.length - 1 && (
                <div className="flex justify-center py-1"><ChevronDown className="h-3.5 w-3.5" style={{ color: T.border }} /></div>
              )}
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── AI Prediction Showcase — a real forecast chart with a confidence
// band and a reorder-point crossing, on a dark panel for visual rhythm
// against the light sections around it. ───────────────────────────────────────
const FORECAST_DATA = [
  { day: '−14d', actual: 42 },
  { day: '−12d', actual: 46 },
  { day: '−10d', actual: 39 },
  { day: '−8d',  actual: 51 },
  { day: '−6d',  actual: 55 },
  { day: '−4d',  actual: 49 },
  { day: '−2d',  actual: 58 },
  { day: 'Today', actual: 60, forecast: 60, upper: 60, lower: 60 },
  { day: '+2d',  forecast: 66, upper: 74, lower: 59 },
  { day: '+4d',  forecast: 74, upper: 87, lower: 64 },
  { day: '+6d',  forecast: 84, upper: 100, lower: 70 },
  { day: '+8d',  forecast: 93, upper: 114, lower: 75 },
  { day: '+10d', forecast: 100, upper: 125, lower: 78 },
]

function ShowcaseTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload
  return (
    <div className="rounded-lg px-3 py-2 text-[11.5px]"
      style={{ background: '#0B1220', border: '1px solid rgba(255,255,255,.12)', color: '#fff' }}>
      <p className="font-semibold mb-1">{label}</p>
      {p?.actual != null && <p style={{ color: '#93C5FD' }}>Actual: {p.actual} units</p>}
      {p?.forecast != null && <p style={{ color: '#C4B5FD' }}>Forecast: {p.forecast} units</p>}
    </div>
  )
}

function AIPredictionShowcase() {
  return (
    <section className="py-16 lg:py-20 relative overflow-hidden" style={{ background: T.navy }}>
      <DotGrid opacity={0.18} />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-5 gap-10 lg:gap-14 items-center">

          <div className="lg:col-span-2">
            <Tag color="#93C5FD">AI Prediction Showcase</Tag>
            <h2 className="font-extrabold tracking-tight mt-3 mb-4 text-white" style={{ fontSize: 'clamp(26px,4vw,36px)', textWrap: 'balance' }}>
              See the forecast before the shelf runs empty
            </h2>
            <p className="text-[14.5px] leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,.65)' }}>
              This is how a single SKU's forecast reads inside the dashboard: two
              weeks of actual sales feeding a 10-day-ahead prediction with a
              confidence band. The moment the forecast is projected to cross the
              reorder point, a purchase recommendation is generated automatically —
              no one has to notice the shelf getting empty.
            </p>
            <div className="flex items-center gap-3 p-3.5 rounded-xl mb-3"
              style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' }}>
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(217,119,6,.25)' }}>
                <ArrowUpRight className="h-4 w-4" style={{ color: '#FBBF24' }} />
              </div>
              <p className="text-[12.5px]" style={{ color: 'rgba(255,255,255,.85)' }}>
                Forecast crosses the reorder point around <b>day +4</b>
              </p>
            </div>
            <div className="flex items-center gap-3 p-3.5 rounded-xl"
              style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' }}>
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(22,163,74,.25)' }}>
                <CalendarClock className="h-4 w-4" style={{ color: '#4ADE80' }} />
              </div>
              <p className="text-[12.5px]" style={{ color: 'rgba(255,255,255,.85)' }}>
                Order suggested with enough lead time to arrive before it does
              </p>
            </div>
            <p className="text-[11px] mt-5" style={{ color: 'rgba(255,255,255,.4)' }}>
              Illustrative example — actual forecasts are generated per SKU from real sales history.
            </p>
          </div>

          <div className="lg:col-span-3 rounded-2xl p-5 lg:p-7"
            style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[13px] font-semibold text-white">Cooking Oil 1L — Demand Forecast</p>
                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,.5)' }}>Prophet · 90% confidence interval</p>
              </div>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide"
                style={{ background: 'rgba(37,99,235,.3)', color: '#93C5FD' }}>Live model output</span>
            </div>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={FORECAST_DATA} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.08)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'rgba(255,255,255,.5)' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,.5)' }} tickLine={false} axisLine={false} width={30} />
                  <Tooltip content={<ShowcaseTooltip />} />
                  <ReferenceLine y={70} stroke="#FBBF24" strokeDasharray="4 4" strokeWidth={1.5}
                    label={{ value: 'Reorder point', fontSize: 10, fill: '#FBBF24', position: 'insideTopLeft' }} />
                  <Area type="monotone" dataKey="upper" stroke="none" fill="url(#bandFill)" isAnimationActive={false} />
                  <Area type="monotone" dataKey="lower" stroke="none" fill={T.navy} fillOpacity={1} isAnimationActive={false} />
                  <Area type="monotone" dataKey="actual" stroke="#3B82F6" strokeWidth={2.5} fill="url(#actualFill)" dot={false} />
                  <Area type="monotone" dataKey="forecast" stroke="#A78BFA" strokeWidth={2.5} strokeDasharray="5 4" fill="none" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-2 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
              {[
                { c: '#3B82F6', l: 'Actual sales' },
                { c: '#A78BFA', l: 'Forecast' },
                { c: '#FBBF24', l: 'Reorder point' },
              ].map(({ c, l }) => (
                <div key={l} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'rgba(255,255,255,.6)' }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: c }} /> {l}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Real Business Use Cases — grounded scenarios, not fabricated
// customer testimonials with fake names and headshots. ────────────────────────
const USE_CASES = [
  { icon: Wheat, color: T.amber, tag: 'Festival demand',
    title: 'Dashain rush, predicted three weeks early',
    problem: 'Demand for ghee, rice, and sugar spikes sharply in the weeks before Dashain — a plain historical average misses it completely.',
    action: 'Festival-aware forecasting recognizes the seasonal pattern from prior years and lifts the forecast ahead of the date, not after sales start climbing.',
    outcome: 'Stock arrives before the rush instead of after the shelf is already empty.' },
  { icon: Truck, color: T.blue, tag: 'Supplier delay',
    title: 'A supplier misses a delivery — the buffer already covered it',
    problem: 'A key supplier delays a shipment by four days. Under a fixed reorder rule, that gap becomes a stockout.',
    action: 'Safety stock is sized to each SKU\'s lead-time variability, not a flat number, so the buffer already accounts for delivery uncertainty.',
    outcome: 'Shelves stay stocked through the delay — no emergency reorder, no lost sales.' },
  { icon: RefreshCw, color: T.green, tag: 'Overstock avoided',
    title: 'Cooking oil, right-sized instead of over-ordered',
    problem: 'A manager keeps over-ordering cooking oil "just in case," tying up cash and shelf space in stock that turns over slowly.',
    action: 'EOQ and reorder-point math recalculate the right order size and cadence from actual demand, not habit.',
    outcome: 'Holding cost drops and the freed-up cash goes toward faster-moving SKUs.' },
]

function UseCasesSection() {
  return (
    <section id="use-cases" className="py-16 lg:py-20" style={{ background: T.pageMid }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          align="left"
          tag="Real Business Use Cases"
          tagColor={T.amber}
          title={<>Built around <BlueText>how a wholesale grocer actually loses money</BlueText></>}
          desc="Three situations that come up constantly in Kathmandu Valley wholesale grocery — and what the system does differently."
        />

        <Grid className="grid lg:grid-cols-3 gap-5">
          {USE_CASES.map(({ icon: Icon, color, tag, title, problem, action, outcome }) => (
            <div key={title} className="rounded-xl p-6 flex flex-col" style={glassCard}>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
                  <Icon className="h-5 w-5" style={{ color }} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>{tag}</span>
              </div>
              <h3 className="font-bold text-[15px] mb-4 leading-snug" style={{ color: T.text }}>{title}</h3>

              <div className="space-y-3 flex-1">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: T.textMuted }}>The problem</p>
                  <p className="text-[12.5px] leading-relaxed" style={{ color: T.textMuted }}>{problem}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color }}>What StockWise does</p>
                  <p className="text-[12.5px] leading-relaxed" style={{ color: T.textSub }}>{action}</p>
                </div>
              </div>

              <div className="flex items-start gap-2 mt-4 pt-4" style={{ borderTop: `1px solid ${T.borderFaint}` }}>
                <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color }} />
                <p className="text-[12.5px] font-medium leading-relaxed" style={{ color: T.text }}>{outcome}</p>
              </div>
            </div>
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
    <section id="roles" className="py-16 lg:py-20" style={{ background: T.page }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          tag="Access Control"
          tagColor={T.amber}
          title={<>Designed for <BlueText>every stakeholder</BlueText></>}
          desc="Role-based access ensures each user sees exactly what they need — and nothing they shouldn't."
        />

        <Grid className="grid md:grid-cols-3 gap-5">
          {ROLES.map(({ icon: Icon, title, badge, color, desc, perms, featured }) => (
            <div key={title}
              className="rounded-xl p-6 flex flex-col"
              style={featured
                ? { ...glassCard, borderColor: `color-mix(in srgb, ${color} 35%, transparent)`, boxShadow: 'var(--shadow-md)' }
                : glassCard}>
              <div className="flex items-start gap-3 mb-4">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
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
                    style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>{badge}</span>
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
                style={{ color, borderColor: `color-mix(in srgb, ${color} 25%, transparent)`, background: `color-mix(in srgb, ${color} 8%, transparent)` }}
                onMouseEnter={e => e.currentTarget.style.background = `color-mix(in srgb, ${color} 18%, transparent)`}
                onMouseLeave={e => e.currentTarget.style.background = `color-mix(in srgb, ${color} 8%, transparent)`}>
                Sign In <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </Grid>
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
            style={{ background: 'color-mix(in srgb, var(--brand-blue) 6%, transparent)', border: `1px solid color-mix(in srgb, var(--brand-blue) 18%, transparent)` }}>
            <Tag color={T.blue}>Ready to get started?</Tag>
            <h2 className="font-extrabold tracking-tight mt-5 mb-4" style={{ fontSize: 'clamp(26px,4vw,38px)', color: T.text, textWrap: 'balance' }}>
              Stop guessing what to order —<br /><BlueText>let the forecast tell you</BlueText>
            </h2>
            <p className="text-[14px] mb-8 max-w-md mx-auto" style={{ color: T.textMuted }}>
              Sign in to your workspace and see today's purchase recommendations,
              stockout risks, and demand forecasts.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
              <Link to="/login"
                className="flex items-center gap-2 px-7 py-3.5 rounded-xl text-[13px] font-bold text-white"
                style={{ background: 'var(--brand-primary)' }}>
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
                <div key={text} className="flex items-center gap-1.5 text-[11.5px]" style={{ color: T.textMuted }}>
                  <Icon className="h-3.5 w-3.5" />
                  {text}
                </div>
              ))}
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-8 mb-10">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-7 w-7 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--brand-primary)' }}>
                <Zap className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
              </div>
              <span className="font-bold text-[15px]" style={{ color: T.text }}>{APP_NAME}</span>
            </div>
            <p className="text-[12.5px] leading-relaxed mb-4 max-w-xs" style={{ color: T.textMuted }}>
              AI-based demand forecasting and inventory optimization for wholesale
              grocery stores in Kathmandu Valley.
            </p>
            <a href="mailto:aayushmaacharya51@gmail.com"
              className="text-[12.5px]" style={{ color: T.blue }}
              onMouseEnter={e => e.target.style.color = T.blueLight}
              onMouseLeave={e => e.target.style.color = T.blue}>
              aayushmaacharya51@gmail.com
            </a>
          </div>

          {[
            { heading:'Navigate', links:[{ label:'Features', href:'#features' },{ label:'How It Works', href:'#workflow' },{ label:'Use Cases', href:'#use-cases' },{ label:'User Roles', href:'#roles' }] },
            { heading:'Platform', links:[{ label:'Sign In', to:'/login' },{ label:'Admin Setup', to:'/setup' }] },
          ].map(({ heading, links }) => (
            <div key={heading}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: T.textMuted }}>{heading}</p>
              <ul className="space-y-2.5">
                {links.map(({ label, to, href }) => (
                  <li key={label}>
                    {to ? (
                      <Link to={to} className="text-[12.5px]" style={{ color: T.textMuted }}
                        onMouseEnter={e => e.target.style.color = T.text}
                        onMouseLeave={e => e.target.style.color = T.textMuted}>{label}</Link>
                    ) : (
                      <a href={href} className="text-[12.5px]" style={{ color: T.textMuted }}
                        onMouseEnter={e => e.target.style.color = T.text}
                        onMouseLeave={e => e.target.style.color = T.textMuted}>{label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: T.textMuted }}>About This Project</p>
            <ul className="space-y-2.5">
              {[
                { icon: GraduationCap, label: 'Pokhara University' },
                { icon: Target,        label: 'Final Year Thesis · 2026' },
                { icon: Globe,         label: 'Kathmandu Valley, Nepal' },
                { icon: MapPin,        label: 'Developer: Aayush Acharya' },
              ].map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2 text-[12.5px]" style={{ color: T.textMuted }}>
                  <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: T.textMuted }} />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="h-px mb-6" style={{ background: T.border }} />
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11.5px]" style={{ color: T.textMuted }}>© {year} {APP_NAME}. All rights reserved.</p>
          <p className="text-[11.5px]" style={{ color: T.textMuted }}>React · FastAPI · MongoDB · Prophet · LSTM · Random Forest</p>
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
        <AIPredictionShowcase />
        <UseCasesSection />
        <RolesSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  )
}
