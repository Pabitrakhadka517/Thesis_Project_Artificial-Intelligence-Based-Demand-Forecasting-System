import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Lock, Mail, BarChart3, Package, TrendingUp, Shield, AlertOctagon } from 'lucide-react'
import logoIcon from '@/assets/logo-icon.png'
import logoIconWhite from '@/assets/logo-icon-white.png'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'
import { selectErrorStatus } from '@/store/slices/authSlice'
import { APP_NAME } from '@/constants'
import { Input } from '@/components/common/Input'
import { Button } from '@/components/common/Button'

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
  const { isDark } = useTheme()
  const errorStatus = useSelector(selectErrorStatus)
  const [showPw, setShowPw] = useState(false)
  const isLocked = errorStatus === 429

  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema) })
  const year = new Date().getFullYear()

  const onSubmit = async data => {
    clearError()
    await login({ email: data.email, password: data.password })
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left Brand Panel ── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[52%] relative overflow-hidden p-12"
        style={{ background: 'var(--brand-primary)' }}
      >
        {/* Logo */}
        <div className="relative flex items-center gap-2">
          <img src={logoIconWhite} className="h-10 w-10 object-contain" alt="" />
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
          © {year} {APP_NAME} · Kathmandu Valley Wholesale Grocery System
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
          <div className="lg:hidden flex items-center gap-1.5 mb-8">
            <img src={isDark ? logoIconWhite : logoIcon} className="h-9 w-9 object-contain" alt="" />
            <span className="text-[17px] font-bold" style={{ color: isDark ? '#FFFFFF' : 'var(--brand-primary)' }}>{APP_NAME}</span>
          </div>

          <h2 className="text-[28px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Welcome back</h2>
          <p className="text-[14px] mb-8" style={{ color: 'var(--text-muted)' }}>
            Sign in to your enterprise dashboard
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Email Address"
              type="email"
              icon={Mail}
              placeholder="your@email.com"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Password"
              type={showPw ? 'text' : 'password'}
              icon={Lock}
              placeholder="••••••••"
              error={errors.password?.message}
              rightElement={
                <button type="button" onClick={() => setShowPw(p => !p)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  style={{ color: 'var(--text-muted)' }}>
                  {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              }
              {...register('password')}
            />

            {/* Forgot password */}
            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-[12px] font-medium" style={{ color: 'var(--brand-blue)' }}>
                Forgot password?
              </Link>
            </div>

            {/* Error banner */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="rounded-lg p-3.5 flex items-start gap-2.5"
                role="alert"
                style={{
                  background: isLocked ? 'rgba(245,158,11,.08)' : 'rgba(239,68,68,.08)',
                  border:     isLocked ? '1px solid rgba(245,158,11,.25)' : '1px solid rgba(239,68,68,.25)',
                  color:      isLocked ? 'var(--color-warning)' : 'var(--color-danger)',
                }}
              >
                <AlertOctagon className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="text-[13px]">{error}</span>
              </motion.div>
            )}

            {/* Submit */}
            <Button type="submit" loading={loading} size="lg" className="w-full">
              {loading ? 'Signing in…' : 'Sign in to Dashboard'}
            </Button>
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
