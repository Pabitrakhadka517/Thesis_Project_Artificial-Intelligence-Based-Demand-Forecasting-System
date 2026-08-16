import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, User, Lock, Mail, Eye, EyeOff,
  ChevronRight, CheckCircle2, Zap, Package, BarChart3, Shield,
} from 'lucide-react'
import { authService } from '@/services/authService'
import { loginSuccess } from '@/store/slices/authSlice'
import { APP_NAME } from '@/constants'
import { passwordSchema } from '@/schemas/password'
import { Input } from '@/components/common/Input'
import { Select } from '@/components/common/Select'
import { Button } from '@/components/common/Button'
import { PasswordStrengthMeter } from '@/components/common/PasswordStrengthMeter'
import logoIcon from '@/assets/logo-icon.png'

// ── Schemas ───────────────────────────────────────────────────────────────────

const step1Schema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters').max(100),
  industry:    z.string().optional(),
})

const step2Schema = z.object({
  fullName:        z.string().min(2, 'Full name must be at least 2 characters'),
  email:           z.string().email('Enter a valid email address'),
  password:        passwordSchema,
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

const INDUSTRIES = [
  'Wholesale & Distribution',
  'Retail',
  'Manufacturing',
  'Food & Beverage',
  'Pharmaceuticals',
  'Electronics',
  'Agriculture',
  'Construction & Building Materials',
  'Other',
].map(i => ({ value: i, label: i }))

const FEATURES = [
  { icon: Package,   label: 'Inventory Management', desc: 'Real-time stock tracking across categories' },
  { icon: BarChart3, label: 'Business Analytics',    desc: 'Revenue, sales, and purchase insights'      },
  { icon: Zap,       label: 'Smart Alerts',          desc: 'Proactive low-stock notifications'           },
  { icon: Shield,    label: 'Role-Based Access',     desc: 'Admin, Manager, and Staff roles'             },
]

const STEPS = ['Company', 'Administrator']

// ── Step 1 — Company Details ──────────────────────────────────────────────────

function CompanyStep({ onNext }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(step1Schema),
  })

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <Input
        label="Company Name"
        icon={Building2}
        placeholder="e.g. Himalayan Wholesale Suppliers"
        error={errors.companyName?.message}
        {...register('companyName')}
      />

      <Select
        label="Industry (optional)"
        placeholder="Select industry"
        options={INDUSTRIES}
        error={errors.industry?.message}
        {...register('industry')}
      />

      <Button type="submit" size="lg" className="w-full mt-2" icon={ChevronRight}>
        Continue
      </Button>
    </form>
  )
}

// ── Step 2 — Admin Account ────────────────────────────────────────────────────

function AdminStep({ companyData, onBack }) {
  const navigate                = useNavigate()
  const dispatch                = useDispatch()
  const qc                      = useQueryClient()
  const [showPw, setShowPw]     = useState(false)
  const [showConf, setShowConf] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [apiError, setApiError] = useState('')

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(step2Schema),
  })
  const passwordValue = watch('password', '')

  const onSubmit = async (values) => {
    setLoading(true)
    setApiError('')
    try {
      const { data: res } = await authService.setup({
        companyName: companyData.companyName,
        industry:    companyData.industry || undefined,
        fullName:    values.fullName,
        email:       values.email,
        password:    values.password,
      })
      const payload = res.data
      dispatch(loginSuccess(payload))
      qc.setQueryData(['setup-status'], { setupRequired: false })
      navigate('/admin/dashboard', { replace: true })
    } catch (err) {
      setApiError(err.response?.data?.message || 'Setup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const eyeBtn = (show, set) => (
    <button type="button" tabIndex={-1}
      aria-label={show ? 'Hide password' : 'Show password'}
      onClick={() => set(v => !v)}
      style={{ color: 'var(--text-muted)' }}>
      {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
    </button>
  )

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Input label="Full Name" icon={User} placeholder="Your full name"
        error={errors.fullName?.message} {...register('fullName')} />

      <Input label="Email Address" icon={Mail} type="email" placeholder="admin@company.com"
        error={errors.email?.message} {...register('email')} />

      <div>
        <Input
          label="Password"
          icon={Lock}
          type={showPw ? 'text' : 'password'}
          placeholder="Min 8 chars, upper/lowercase, number & symbol"
          error={errors.password?.message}
          rightElement={eyeBtn(showPw, setShowPw)}
          {...register('password')}
        />
        <PasswordStrengthMeter value={passwordValue} />
      </div>

      <Input
        label="Confirm Password"
        icon={Lock}
        type={showConf ? 'text' : 'password'}
        placeholder="Repeat your password"
        error={errors.confirmPassword?.message}
        rightElement={eyeBtn(showConf, setShowConf)}
        {...register('confirmPassword')}
      />

      {apiError && (
        <p role="alert" className="text-[13px] text-center px-3 py-2 rounded-lg"
          style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', color: 'var(--color-danger)' }}>
          {apiError}
        </p>
      )}

      <div className="flex gap-3 mt-2">
        <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" size="lg" className="flex-2" loading={loading} icon={CheckCircle2}>
          Complete Setup
        </Button>
      </div>
    </form>
  )
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export default function SetupWizardPage() {
  const [step, setStep]               = useState(0)
  const [companyData, setCompanyData] = useState(null)

  const handleStep1 = (data) => {
    setCompanyData(data)
    setStep(1)
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left Brand Panel ── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[52%] relative overflow-hidden p-12"
        style={{ background: 'var(--brand-primary)' }}
      >
        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <img src={logoIcon} className="h-10 w-10 object-contain" alt="" />
          <div>
            <p className="text-white font-bold text-[18px] tracking-tight">{APP_NAME}</p>
            <p className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: 'rgba(219,234,254,.65)' }}>Inventory Intelligence</p>
          </div>
        </div>

        {/* Headline */}
        <div className="relative space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-widest"
            style={{ background: 'rgba(255,255,255,.15)', color: 'rgba(219,234,254,.9)', border: '1px solid rgba(255,255,255,.2)' }}>
            First-Time Setup
          </div>
          <h1 className="text-[32px] font-bold tracking-tight leading-tight text-white">
            Welcome to<br />
            <span style={{ color: 'rgba(186,230,253,.95)' }}>{APP_NAME}</span>
          </h1>
          <p className="text-[15px] leading-relaxed" style={{ color: 'rgba(219,234,254,.8)' }}>
            Set up your company workspace in just two steps. You'll be managing inventory in minutes.
          </p>
        </div>

        {/* Features */}
        <div className="relative space-y-3">
          {FEATURES.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'rgba(255,255,255,.15)' }}>
                <Icon className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-white">{label}</p>
                <p className="text-[11px]" style={{ color: 'rgba(219,234,254,.65)' }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right Form Panel ── */}
      <div className="flex-1 flex items-center justify-center p-8" style={{ background: 'var(--surface-page)' }}>
        <div className="w-full max-w-md space-y-8">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 mb-4">
            <img src={logoIcon} className="h-9 w-9 object-contain" alt="" />
            <p className="font-bold text-[17px]" style={{ color: 'var(--text-primary)' }}>{APP_NAME}</p>
          </div>

          {/* Header */}
          <div>
            <h2 className="text-[26px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {step === 0 ? 'Company Details' : 'Administrator Account'}
            </h2>
            <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
              {step === 0
                ? 'Tell us about your business'
                : `Setting up workspace for "${companyData?.companyName}"`}
            </p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all"
                    style={{
                      background: i <= step ? 'var(--brand-blue)' : 'var(--surface-muted)',
                      color:      i <= step ? '#fff'    : 'var(--text-muted)',
                      border:     i <= step ? 'none'    : '1.5px solid var(--border)',
                    }}>
                    {i < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span className="text-[12px] font-semibold"
                    style={{ color: i <= step ? 'var(--brand-blue)' : 'var(--text-muted)' }}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="w-8 h-px mx-1"
                    style={{ background: i < step ? 'var(--brand-blue)' : 'var(--border)' }} />
                )}
              </div>
            ))}
          </div>

          {/* Form card */}
          <div className="rounded-2xl p-7"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: step === 0 ? -16 : 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: step === 0 ? 16 : -16 }}
                transition={{ duration: 0.2 }}
              >
                {step === 0
                  ? <CompanyStep onNext={handleStep1} />
                  : <AdminStep companyData={companyData} onBack={() => setStep(0)} />
                }
              </motion.div>
            </AnimatePresence>
          </div>

          <p className="text-center text-[12px]" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
            This setup runs once. Admin can add more users after logging in.
          </p>
        </div>
      </div>
    </div>
  )
}
