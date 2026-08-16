import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Lock, Mail, User as UserIcon, BarChart3, Package, TrendingUp, Shield } from 'lucide-react'
import logoIcon from '@/assets/logo-icon.png'
import logoIconWhite from '@/assets/logo-icon-white.png'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'
import { APP_NAME } from '@/constants'
import { passwordSchema } from '@/schemas/password'
import { Input } from '@/components/common/Input'
import { Button } from '@/components/common/Button'
import { PasswordStrengthMeter } from '@/components/common/PasswordStrengthMeter'

const schema = z.object({
  fullName:        z.string().min(2, 'Name must be at least 2 characters'),
  email:           z.string().email('Enter a valid email address'),
  password:        passwordSchema,
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
  const { isDark } = useTheme()
  const [showPw, setShowPw]   = useState(false)
  const [showCpw, setShowCpw] = useState(false)

  const { register, handleSubmit, watch, formState: { errors } } = useForm({ resolver: zodResolver(schema) })
  const year = new Date().getFullYear()
  const passwordValue = watch('password', '')

  const onSubmit = async ({ fullName, email, password }) => {
    clearError()
    await doRegister({ fullName, email, password })
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left Brand Panel ── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[52%] relative overflow-hidden p-12"
        style={{ background: 'var(--brand-primary)' }}
      >
        {/* Logo */}
        <Link to="/" className="relative flex items-center gap-2">
          <img src={logoIconWhite} className="h-10 w-10 object-contain" alt="" />
          <div>
            <span className="text-white text-[18px] font-bold tracking-tight">{APP_NAME}</span>
            <p className="text-[11px] font-medium" style={{ color: 'rgba(219,234,254,.7)' }}>Enterprise Analytics Platform</p>
          </div>
        </Link>

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
          © {year} {APP_NAME} · Kathmandu Valley Wholesale Grocery System
        </p>
      </div>

      {/* ── Right Register Panel ── */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12" style={{ background: 'var(--surface-page)' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-100"
        >
          {/* Mobile logo */}
          <Link to="/" className="lg:hidden flex items-center gap-1.5 mb-8">
            <img src={isDark ? logoIconWhite : logoIcon} className="h-9 w-9 object-contain" alt="" />
            <span className="text-[17px] font-bold" style={{ color: isDark ? '#FFFFFF' : 'var(--brand-primary)' }}>{APP_NAME}</span>
          </Link>

          <h2 className="text-[28px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Create account</h2>
          <p className="text-[14px] mb-8" style={{ color: 'var(--text-muted)' }}>
            Get started with your enterprise dashboard
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Full Name"
              icon={UserIcon}
              placeholder="Alex Johnson"
              error={errors.fullName?.message}
              {...register('fullName')}
            />

            <Input
              label="Email Address"
              type="email"
              icon={Mail}
              placeholder="you@company.com"
              error={errors.email?.message}
              {...register('email')}
            />

            <div>
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
              <PasswordStrengthMeter value={passwordValue} />
            </div>

            <Input
              label="Confirm Password"
              type={showCpw ? 'text' : 'password'}
              icon={Lock}
              placeholder="••••••••"
              error={errors.confirmPassword?.message}
              rightElement={
                <button type="button" onClick={() => setShowCpw(p => !p)}
                  aria-label={showCpw ? 'Hide password' : 'Show password'}
                  style={{ color: 'var(--text-muted)' }}>
                  {showCpw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              }
              {...register('confirmPassword')}
            />

            {/* Error banner */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                role="alert"
                className="rounded-lg p-3.5 text-[13px]"
                style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', color: 'var(--color-danger)' }}
              >
                {error}
              </motion.div>
            )}

            {/* Submit */}
            <Button type="submit" loading={loading} size="lg" className="w-full">
              {loading ? 'Creating account…' : 'Create Account'}
            </Button>
          </form>

          <p className="text-center text-[13px] mt-6" style={{ color: 'var(--text-muted)' }}>
            Already have an account?{' '}
            <Link to="/login" className="font-semibold" style={{ color: 'var(--brand-blue)' }}>
              Sign in
            </Link>
          </p>

          <p className="text-center text-[12px] mt-4" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
            Secured · Enterprise · Kathmandu Valley Wholesale
          </p>
        </motion.div>
      </div>
    </div>
  )
}
