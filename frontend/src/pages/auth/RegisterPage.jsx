import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Lock, Mail, User as UserIcon, Zap, BarChart3, Package, TrendingUp, Shield } from 'lucide-react'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { APP_NAME } from '@/constants'

const schema = z.object({
  fullName:        z.string().min(2, 'Name must be at least 2 characters'),
  email:           z.string().email('Enter a valid email address'),
  password:        z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
    .regex(/\d/, 'Password must contain at least one number'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path:    ['confirmPassword'],
})

const FEATURES = [
  { icon: TrendingUp, label: 'Demand Forecasting',    desc: 'ARIMA, Prophet, LSTM & more'     },
  { icon: Package,    label: 'Inventory Intelligence', desc: 'Real-time stock monitoring'       },
  { icon: BarChart3,  label: 'Business Analytics',     desc: 'Power BI-quality dashboards'      },
  { icon: Shield,     label: 'Smart Alerts',           desc: 'Proactive reorder notifications'  },
]

export default function RegisterPage() {
  const { register: doRegister, loading, error, clearError } = useAuth()
  const [showPw, setShowPw]   = useState(false)
  const [showCpw, setShowCpw] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema) })

  const onSubmit = async ({ fullName, email, password }) => {
    clearError()
    await doRegister({ fullName, email, password })
  }

  const inputStyle = hasError => ({
    background:   '#FFFFFF',
    border:       `1.5px solid ${hasError ? '#EF4444' : '#E5E7EB'}`,
    borderRadius: '10px',
    color:        '#111827',
    transition:   'border-color .15s',
  })

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
              Join the<br />
              <span style={{ color: 'rgba(186,230,253,.95)' }}>Intelligence Network</span>
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

      {/* ── Right Register Panel ── */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12" style={{ background: '#FFFFFF' }}>
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
            <span className="text-[17px] font-bold" style={{ color: '#111827' }}>{APP_NAME}</span>
          </div>

          <h2 className="text-[28px] font-bold mb-1" style={{ color: '#111827' }}>Create account</h2>
          <p className="text-[14px] mb-8" style={{ color: '#6B7280' }}>
            Get started with your enterprise dashboard
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5"
                style={{ color: '#6B7280' }}>
                Full Name
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#9CA3AF' }} />
                <input
                  type="text"
                  placeholder="Alex Johnson"
                  className="w-full text-[14px] outline-none"
                  style={{ ...inputStyle(errors.fullName), padding: '12px 12px 12px 40px' }}
                  onFocus={e => { if (!errors.fullName) e.target.style.borderColor = '#2563EB' }}
                  onBlur={e  => { if (!errors.fullName) e.target.style.borderColor = '#E5E7EB' }}
                  {...register('fullName')}
                />
              </div>
              {errors.fullName && <p className="text-[11px] mt-1" style={{ color: '#EF4444' }}>{errors.fullName.message}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5"
                style={{ color: '#6B7280' }}>
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#9CA3AF' }} />
                <input
                  type="email"
                  placeholder="you@company.com"
                  className="w-full text-[14px] outline-none"
                  style={{ ...inputStyle(errors.email), padding: '12px 12px 12px 40px' }}
                  onFocus={e => { if (!errors.email) e.target.style.borderColor = '#2563EB' }}
                  onBlur={e  => { if (!errors.email) e.target.style.borderColor = '#E5E7EB' }}
                  {...register('email')}
                />
              </div>
              {errors.email && <p className="text-[11px] mt-1" style={{ color: '#EF4444' }}>{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5"
                style={{ color: '#6B7280' }}>
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#9CA3AF' }} />
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="w-full text-[14px] outline-none"
                  style={{ ...inputStyle(errors.password), padding: '12px 44px 12px 40px' }}
                  onFocus={e => { if (!errors.password) e.target.style.borderColor = '#2563EB' }}
                  onBlur={e  => { if (!errors.password) e.target.style.borderColor = '#E5E7EB' }}
                  {...register('password')}
                />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2"
                  style={{ color: '#9CA3AF' }}>
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-[11px] mt-1" style={{ color: '#EF4444' }}>{errors.password.message}</p>}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5"
                style={{ color: '#6B7280' }}>
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#9CA3AF' }} />
                <input
                  type={showCpw ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="w-full text-[14px] outline-none"
                  style={{ ...inputStyle(errors.confirmPassword), padding: '12px 44px 12px 40px' }}
                  onFocus={e => { if (!errors.confirmPassword) e.target.style.borderColor = '#2563EB' }}
                  onBlur={e  => { if (!errors.confirmPassword) e.target.style.borderColor = '#E5E7EB' }}
                  {...register('confirmPassword')}
                />
                <button type="button" onClick={() => setShowCpw(p => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2"
                  style={{ color: '#9CA3AF' }}>
                  {showCpw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmPassword && <p className="text-[11px] mt-1" style={{ color: '#EF4444' }}>{errors.confirmPassword.message}</p>}
            </div>

            {/* Error banner */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg p-3.5 text-[13px]"
                style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B' }}
              >
                {error}
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
                  Creating account…
                </span>
              ) : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-[13px] mt-6" style={{ color: '#6B7280' }}>
            Already have an account?{' '}
            <Link to="/login" className="font-semibold" style={{ color: '#2563EB' }}>
              Sign in
            </Link>
          </p>

          <p className="text-center text-[12px] mt-4" style={{ color: '#D1D5DB' }}>
            Secured · Enterprise · Kathmandu Valley Wholesale
          </p>
        </motion.div>
      </div>
    </div>
  )
}
