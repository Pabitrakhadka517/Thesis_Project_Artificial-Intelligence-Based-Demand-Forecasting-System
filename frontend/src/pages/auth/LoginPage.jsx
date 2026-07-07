import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Lock, Mail, Zap, BarChart3, Package, TrendingUp, Shield, AlertOctagon } from 'lucide-react'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { useAuth } from '@/hooks/useAuth'
import { selectErrorStatus } from '@/store/slices/authSlice'
import { APP_NAME } from '@/constants'

const schema = z.object({
  email:    z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

const FEATURES = [
  { icon: TrendingUp, label: 'Demand Forecasting',    desc: 'ARIMA, Prophet, LSTM & more' },
  { icon: Package,    label: 'Inventory Intelligence', desc: 'Real-time stock monitoring'   },
  { icon: BarChart3,  label: 'Business Analytics',     desc: 'Power BI-quality dashboards'  },
  { icon: Shield,     label: 'Smart Alerts',           desc: 'Proactive reorder notifications' },
]

export default function LoginPage() {
  const { login, loading, error, clearError } = useAuth()
  const errorStatus = useSelector(selectErrorStatus)
  const [showPw, setShowPw] = useState(false)
  const isLocked = errorStatus === 429

  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema) })

  const onSubmit = async data => {
    clearError()
    await login({ email: data.email, password: data.password })
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left Brand Panel ── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[52%] relative overflow-hidden p-12"
        style={{ background: '#03045e' }}
      >
        {/* Subtle grid */}
        <div className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px)',
            backgroundSize:  '40px 40px',
          }}
        />

        {/* Glow orbs */}
        <div className="absolute top-1/4 left-1/4 h-64 w-64 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle,rgba(255,255,255,.7),transparent)' }} />
        <div className="absolute bottom-1/3 right-1/4 h-48 w-48 rounded-full opacity-15 blur-3xl"
          style={{ background: 'radial-gradient(circle,rgba(186,230,253,.6),transparent)' }} />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,.18)', boxShadow: '0 6px 20px rgba(0,0,0,.2)' }}>
            <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <span className="text-white text-[18px] font-bold tracking-tight">{APP_NAME}</span>
            <p className="text-[11px] font-medium" style={{ color: 'rgba(219,234,254,.7)' }}>Enterprise Analytics Platform</p>
          </div>
        </div>

        {/* Hero text */}
        <div className="relative space-y-6">
          <div>
            <h1 className="text-[42px] font-bold leading-[1.1] tracking-tight text-white">
              AI-Powered<br />
              <span style={{ color: 'rgba(186,230,253,.95)' }}>Demand Intelligence</span>
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'rgba(219,234,254,.8)' }}>
              Enterprise-grade forecasting for wholesale grocery stores in Kathmandu Valley.
              Predict demand, optimize inventory, and eliminate stockouts.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {FEATURES.map(f => {
              const Icon = f.icon
              return (
                <div key={f.label} className="rounded-xl p-4"
                  style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.15)' }}>
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center mb-2"
                    style={{ background: 'rgba(255,255,255,.15)' }}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <p className="text-[13px] font-semibold text-white">{f.label}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'rgba(219,234,254,.7)' }}>{f.desc}</p>
                </div>
              )
            })}
          </div>
        </div>

        <p className="relative text-[11px]" style={{ color: 'rgba(219,234,254,.45)' }}>
          © 2025 {APP_NAME} · Kathmandu Valley Wholesale Grocery System
        </p>
      </div>

      {/* ── Right Login Panel ── */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12" style={{ background: 'var(--surface-page)' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-100"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center"
              style={{ background: '#03045e' }}>
              <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-[17px] font-bold" style={{ color: 'var(--text-primary)' }}>{APP_NAME}</span>
          </div>

          <h2 className="text-[28px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Welcome back</h2>
          <p className="text-[14px] mb-8" style={{ color: 'var(--text-muted)' }}>
            Sign in to your enterprise dashboard
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5"
                style={{ color: 'var(--text-muted)' }}>
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                <input
                  type="email"
                  placeholder="your@email.com"
                  className="w-full text-[14px] outline-none"
                  style={{
                    background:   'var(--surface-card)',
                    border:       `1.5px solid ${errors.email ? '#EF4444' : 'var(--border)'}`,
                    borderRadius: '10px',
                    padding:      '12px 12px 12px 40px',
                    color:        'var(--text-primary)',
                    transition:   'border-color .15s',
                  }}
                  onFocus={e => { if (!errors.email) e.target.style.borderColor = '#2563EB' }}
                  onBlur={e  => { if (!errors.email) e.target.style.borderColor = 'var(--border)' }}
                  {...register('email')}
                />
              </div>
              {errors.email && <p className="text-[11px] mt-1" style={{ color: '#EF4444' }}>{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5"
                style={{ color: 'var(--text-muted)' }}>
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="w-full text-[14px] outline-none"
                  style={{
                    background:   'var(--surface-card)',
                    border:       `1.5px solid ${errors.password ? '#EF4444' : 'var(--border)'}`,
                    borderRadius: '10px',
                    padding:      '12px 44px 12px 40px',
                    color:        'var(--text-primary)',
                    transition:   'border-color .15s',
                  }}
                  onFocus={e => { if (!errors.password) e.target.style.borderColor = '#2563EB' }}
                  onBlur={e  => { if (!errors.password) e.target.style.borderColor = 'var(--border)' }}
                  {...register('password')}
                />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }}>
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-[11px] mt-1" style={{ color: '#EF4444' }}>{errors.password.message}</p>}
            </div>

            {/* Forgot password */}
            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-[12px] font-medium" style={{ color: '#2563EB' }}>
                Forgot password?
              </Link>
            </div>

            {/* Error banner */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg p-3.5 flex items-start gap-2.5"
                style={{
                  background: isLocked ? '#FFFBEB' : '#FEF2F2',
                  border:     isLocked ? '1px solid #FDE68A' : '1px solid #FECACA',
                  color:      isLocked ? '#92400E' : '#991B1B',
                }}
              >
                <AlertOctagon className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="text-[13px]">{error}</span>
              </motion.div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl py-3.5 text-[14px] font-bold text-white transition-all"
              style={{
                background: loading ? 'rgba(3,4,94,.4)' : '#03045e',
                boxShadow:  loading ? 'none' : '0 4px 20px rgba(3,4,94,.35)',
                cursor:     loading ? 'not-allowed' : 'pointer',
                opacity:    loading ? .7 : 1,
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.boxShadow = '0 6px 24px rgba(3,4,94,.5)' }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.boxShadow = '0 4px 20px rgba(3,4,94,.35)' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Signing in…
                </span>
              ) : 'Sign in to Dashboard'}
            </button>
          </form>

          <p className="text-center text-[13px] mt-6" style={{ color: 'var(--text-muted)' }}>
            Contact your administrator to get an account.
          </p>

          <p className="text-center text-[12px] mt-4" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
            Secured · Enterprise · Kathmandu Valley Wholesale
          </p>
        </motion.div>
      </div>
    </div>
  )
}
