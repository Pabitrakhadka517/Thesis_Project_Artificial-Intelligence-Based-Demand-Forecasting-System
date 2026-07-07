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

// ── Schemas ───────────────────────────────────────────────────────────────────

const step1Schema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters').max(100),
  industry:    z.string().optional(),
})

const step2Schema = z.object({
  fullName:        z.string().min(2, 'Full name must be at least 2 characters'),
  email:           z.string().email('Enter a valid email address'),
  password:        z.string().min(8, 'Password must be at least 8 characters')
                    .regex(/\d/, 'Password must contain at least one number'),
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
]

const FEATURES = [
  { icon: Package,   label: 'Inventory Management', desc: 'Real-time stock tracking across categories' },
  { icon: BarChart3, label: 'Business Analytics',    desc: 'Revenue, sales, and purchase insights'      },
  { icon: Zap,       label: 'Smart Alerts',          desc: 'Proactive low-stock notifications'           },
  { icon: Shield,    label: 'Role-Based Access',     desc: 'Admin, Manager, and Staff roles'             },
]

const STEPS = ['Company', 'Administrator']

// ── Field component ───────────────────────────────────────────────────────────

function Field({ label, error, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-semibold uppercase tracking-widest"
        style={{ color: '#6B7280' }}>{label}</label>
      {children}
      {error && <p className="text-[12px]" style={{ color: '#EF4444' }}>{error}</p>}
    </div>
  )
}

function Input({ icon: Icon, rightSlot, className = '', ...props }) {
  return (
    <div className="relative">
      {Icon && (
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
          style={{ color: '#9CA3AF' }} />
      )}
      <input
        className={`w-full h-11 rounded-xl text-[14px] transition-all outline-none
          ${Icon ? 'pl-10' : 'pl-4'} ${rightSlot ? 'pr-10' : 'pr-4'} ${className}`}
        style={{
          background: '#FFFFFF',
          border:     '1.5px solid #E5E7EB',
          color:      '#111827',
        }}
        onFocus={e  => { e.currentTarget.style.borderColor = '#2563EB' }}
        onBlur={e   => { e.currentTarget.style.borderColor = '#E5E7EB' }}
        {...props}
      />
      {rightSlot}
    </div>
  )
}

// ── Step 1 — Company Details ──────────────────────────────────────────────────

function CompanyStep({ onNext }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(step1Schema),
  })

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <Field label="Company Name" error={errors.companyName?.message}>
        <Input
          icon={Building2}
          placeholder="e.g. Himalayan Wholesale Suppliers"
          {...register('companyName')}
        />
      </Field>

      <Field label="Industry (optional)" error={errors.industry?.message}>
        <select
          {...register('industry')}
          className="w-full h-11 rounded-xl px-4 text-[14px] outline-none appearance-none transition-all"
          style={{
            background: '#FFFFFF',
            border:     '1.5px solid #E5E7EB',
            color:      '#111827',
          }}
          onFocus={e  => { e.currentTarget.style.borderColor = '#2563EB' }}
          onBlur={e   => { e.currentTarget.style.borderColor = '#E5E7EB' }}
        >
          <option value="">Select industry</option>
          {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
      </Field>

      <button type="submit"
        className="w-full h-11 rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 transition-all mt-2 text-white"
        style={{ background: '#03045e', boxShadow: '0 4px 16px rgba(3,4,94,.35)' }}
        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 22px rgba(3,4,94,.5)'}
        onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(3,4,94,.35)'}>
        Continue
        <ChevronRight className="h-4 w-4" />
      </button>
    </form>
  )
}

// ── Step 2 — Admin Account ────────────────────────────────────────────────────

function AdminStep({ companyData, onBack }) {
  const navigate              = useNavigate()
  const dispatch              = useDispatch()
  const qc                    = useQueryClient()
  const [showPw, setShowPw]   = useState(false)
  const [showConf, setShowConf] = useState(false)
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState('')

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(step2Schema),
  })

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
      onClick={() => set(v => !v)}
      className="absolute right-3 top-1/2 -translate-y-1/2"
      style={{ color: '#9CA3AF' }}>
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  )

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Field label="Full Name" error={errors.fullName?.message}>
        <Input icon={User} placeholder="Your full name" {...register('fullName')} />
      </Field>

      <Field label="Email Address" error={errors.email?.message}>
        <Input icon={Mail} type="email" placeholder="admin@company.com" {...register('email')} />
      </Field>

      <Field label="Password" error={errors.password?.message}>
        <Input
          icon={Lock}
          type={showPw ? 'text' : 'password'}
          placeholder="Min 8 chars, at least 1 number"
          rightSlot={eyeBtn(showPw, setShowPw)}
          {...register('password')}
        />
      </Field>

      <Field label="Confirm Password" error={errors.confirmPassword?.message}>
        <Input
          icon={Lock}
          type={showConf ? 'text' : 'password'}
          placeholder="Repeat your password"
          rightSlot={eyeBtn(showConf, setShowConf)}
          {...register('confirmPassword')}
        />
      </Field>

      {apiError && (
        <p className="text-[13px] text-center px-3 py-2 rounded-lg"
          style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B' }}>
          {apiError}
        </p>
      )}

      <div className="flex gap-3 mt-2">
        <button type="button" onClick={onBack}
          className="flex-1 h-11 rounded-xl text-[14px] font-semibold transition-all"
          style={{ background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#E9EEF4'; e.currentTarget.style.color = '#374151' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#F3F4F6'; e.currentTarget.style.color = '#6B7280' }}>
          Back
        </button>
        <button type="submit" disabled={loading}
          className="flex-2 h-11 rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-60 text-white"
          style={{ background: '#03045e', boxShadow: '0 4px 16px rgba(3,4,94,.35)' }}>
          {loading ? (
            <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Complete Setup
            </>
          )}
        </button>
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
        style={{ background: '#03045e' }}
      >
        {/* Subtle grid */}
        <div className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px)',
            backgroundSize:  '40px 40px',
          }}
        />
        <div className="absolute top-1/4 left-1/4 h-64 w-64 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle,rgba(255,255,255,.7),transparent)' }} />
        <div className="absolute bottom-1/3 right-1/4 h-48 w-48 rounded-full opacity-15 blur-3xl"
          style={{ background: 'radial-gradient(circle,rgba(186,230,253,.6),transparent)' }} />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,.18)', boxShadow: '0 6px 20px rgba(0,0,0,.2)' }}>
            <Package className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-[18px] tracking-tight">StockWise</p>
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
            <span style={{ color: 'rgba(186,230,253,.95)' }}>StockWise</span>
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
      <div className="flex-1 flex items-center justify-center p-8" style={{ background: '#FFFFFF' }}>
        <div className="w-full max-w-md space-y-8">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center"
              style={{ background: '#03045e' }}>
              <Package className="h-4 w-4 text-white" />
            </div>
            <p className="font-bold text-[17px]" style={{ color: '#111827' }}>StockWise</p>
          </div>

          {/* Header */}
          <div>
            <h2 className="text-[26px] font-bold tracking-tight" style={{ color: '#111827' }}>
              {step === 0 ? 'Company Details' : 'Administrator Account'}
            </h2>
            <p className="text-[13px] mt-1" style={{ color: '#6B7280' }}>
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
                      background: i <= step ? '#2563EB' : '#F3F4F6',
                      color:      i <= step ? '#fff'    : '#9CA3AF',
                      border:     i <= step ? 'none'    : '1.5px solid #E5E7EB',
                    }}>
                    {i < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span className="text-[12px] font-semibold"
                    style={{ color: i <= step ? '#2563EB' : '#9CA3AF' }}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="w-8 h-px mx-1"
                    style={{ background: i < step ? '#2563EB' : '#E5E7EB' }} />
                )}
              </div>
            ))}
          </div>

          {/* Form card */}
          <div className="rounded-2xl p-7"
            style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
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

          <p className="text-center text-[12px]" style={{ color: '#D1D5DB' }}>
            This setup runs once. Admin can add more users after logging in.
          </p>
        </div>
      </div>
    </div>
  )
}
