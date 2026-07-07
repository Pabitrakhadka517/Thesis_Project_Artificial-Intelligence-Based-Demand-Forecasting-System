import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Building2, Bell, Cpu, Shield, Save, Eye, EyeOff } from 'lucide-react'
import axiosInstance from '@/api/axiosInstance'
import { useToast } from '@/hooks/useToast'
import { useRole } from '@/hooks/useRole'
import { ImageUpload } from '@/components/common/ImageUpload'

const TABS = [
  { key: 'company',       label: 'Company',      Icon: Building2, adminOnly: true  },
  { key: 'notifications', label: 'Notifications', Icon: Bell,      adminOnly: false },
  { key: 'ai',            label: 'AI Config',     Icon: Cpu,       adminOnly: true  },
  { key: 'security',      label: 'Security',      Icon: Shield,    adminOnly: false },
]

const companySchema = z.object({
  companyName:     z.string().min(2, 'Company name required'),
  businessType:    z.string().optional(),
  address:         z.string().optional(),
  phone:           z.string().optional(),
  email:           z.string().email('Invalid email').optional().or(z.literal('')),
  taxNumber:       z.string().optional(),
  currency:        z.string().default('NPR'),
  fiscalYearStart: z.string().default('Shrawan'),
})

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Required'),
  newPassword:     z.string().min(8, 'At least 8 characters'),
  confirmPassword: z.string(),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: "Passwords don't match", path: ['confirmPassword'],
})

// ── Shared UI components ──────────────────────────────────────────────────────
function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5"
        style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
      {error && <p className="text-[11px] mt-1" style={{ color: 'var(--error)' }}>{error}</p>}
    </div>
  )
}

function FInput({ error, ...props }) {
  return (
    <input
      className="w-full px-3 py-2.5 rounded-lg text-[13px] outline-none"
      style={{
        background: 'var(--surface-muted)',
        border: `1.5px solid ${error ? 'var(--error)' : 'var(--border)'}`,
        color: 'var(--text-primary)',
      }}
      onFocus={e => { if (!error) e.target.style.borderColor = 'var(--brand)' }}
      onBlur={e => { if (!error) e.target.style.borderColor = 'var(--border)' }}
      {...props}
    />
  )
}

function FSelect({ children, ...props }) {
  return (
    <select
      className="w-full px-3 py-2.5 rounded-lg text-[13px] outline-none"
      style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)', color: 'var(--text-primary)' }}
      {...props}>
      {children}
    </select>
  )
}

function SectionCard({ title, description, children }) {
  return (
    <div className="rounded-xl p-6" style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
      <div className="mb-5">
        <h3 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        {description && <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</p>}
      </div>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange, label, description }) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-b-0"
      style={{ borderColor: 'var(--border)' }}>
      <div className="flex-1 pr-4">
        <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</p>
        {description && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{description}</p>}
      </div>
      <button type="button" onClick={() => onChange(!checked)}
        className="relative h-6 w-11 rounded-full transition-colors duration-200 shrink-0"
        style={{ background: checked ? 'var(--brand)' : 'var(--border)' }}>
        <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200"
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }} />
      </button>
    </div>
  )
}

function SaveBtn({ isPending, label = 'Save Changes' }) {
  return (
    <button type="submit" disabled={isPending}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold text-white mt-5"
      style={{ background: '#03045e', opacity: isPending ? .7 : 1 }}>
      <Save className="h-4 w-4" />
      {isPending ? 'Saving…' : label}
    </button>
  )
}

// ── useSettings helper — shared query ────────────────────────────────────────
function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => axiosInstance.get('/settings').then(r => r.data?.data?.settings || {}),
    staleTime: 60_000,
  })
}

// ── Company Tab ───────────────────────────────────────────────────────────────
function CompanyTab() {
  const { toast } = useToast()
  const qc        = useQueryClient()
  const { data: settings = {} } = useSettings()

  const [pendingLogo, setPendingLogo] = useState(null)
  const [logoError, setLogoError]     = useState(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(companySchema),
    defaultValues: {
      companyName: 'Himalayan Wholesale Suppliers', currency: 'NPR', fiscalYearStart: 'Shrawan',
    },
  })

  useEffect(() => {
    if (settings.companyName) {
      reset({
        companyName:     settings.companyName     || '',
        businessType:    settings.businessType    || '',
        address:         settings.address         || '',
        phone:           settings.phone           || '',
        email:           settings.email           || '',
        taxNumber:       settings.taxNumber       || '',
        currency:        settings.currency        || 'NPR',
        fiscalYearStart: settings.fiscalYearStart || 'Shrawan',
      })
    }
  }, [settings, reset])

  const saveMutation = useMutation({
    mutationFn: (d) => axiosInstance.patch('/settings', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      toast({ title: 'Company settings saved', variant: 'success' })
    },
    onError: (e) => toast({ title: e.response?.data?.message || 'Failed', variant: 'error' }),
  })

  const logoUploadMutation = useMutation({
    mutationFn: (file) => {
      const form = new FormData()
      form.append('logo', file)
      return axiosInstance.post('/settings/logo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setPendingLogo(null)
      setLogoError(null)
      toast({ title: 'Company logo updated', variant: 'success' })
    },
    onError: (e) => {
      setLogoError(e.response?.data?.message || 'Upload failed. Please try again.')
      toast({ title: 'Logo upload failed', description: e.response?.data?.message, variant: 'error' })
    },
  })

  const logoDeleteMutation = useMutation({
    mutationFn: () => axiosInstance.delete('/settings/logo'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setPendingLogo(null)
      toast({ title: 'Company logo removed', variant: 'success' })
    },
    onError: (e) => toast({ title: 'Remove failed', description: e.response?.data?.message, variant: 'error' }),
  })

  const MONTHS_BS = ['Baisakh','Jestha','Ashadh','Shrawan','Bhadra','Ashwin','Kartik','Mangsir','Poush','Magh','Falgun','Chaitra']
  const currentLogo = settings.company_logo || null

  return (
    <div className="space-y-4">
      {/* ── Logo section ── */}
      <SectionCard title="Company Logo" description="Displayed on invoices, reports, and the dashboard header">
        <div className="flex items-start gap-6">
          <ImageUpload
            value={currentLogo}
            onFileSelect={(file) => {
              setPendingLogo(file)
              setLogoError(null)
            }}
            onRemove={() => {
              if (currentLogo) {
                logoDeleteMutation.mutate()
              } else {
                setPendingLogo(null)
              }
            }}
            uploading={logoUploadMutation.isPending || logoDeleteMutation.isPending}
            error={logoError}
            label="Company Logo"
            shape="square"
            size="lg"
          />
          <div className="flex-1 pt-1">
            <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              {settings.companyName || 'Your Company'}
            </p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              Upload a square logo for best results.<br />
              Supported formats: JPEG, PNG, WebP — max 5 MB.
            </p>
            {pendingLogo && !logoUploadMutation.isPending && (
              <button
                type="button"
                onClick={() => logoUploadMutation.mutate(pendingLogo)}
                className="flex items-center gap-2 mt-3 px-4 py-2 rounded-lg text-[12px] font-bold text-white"
                style={{ background: '#03045e' }}
              >
                <Save className="h-3.5 w-3.5" /> Save Logo
              </button>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ── Company info form ── */}
      <SectionCard title="Company Information" description="Basic business details used on invoices and reports">
        <form onSubmit={handleSubmit(saveMutation.mutate)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company Name *" error={errors.companyName?.message}>
              <FInput placeholder="Himalayan Wholesale Suppliers" error={!!errors.companyName} {...register('companyName')} />
            </Field>
            <Field label="Business Type">
              <FInput placeholder="Wholesale / Retail" {...register('businessType')} />
            </Field>
            <Field label="Phone">
              <FInput placeholder="+977-01-..." {...register('phone')} />
            </Field>
            <Field label="Email">
              <FInput type="email" placeholder="info@company.com" {...register('email')} />
            </Field>
            <Field label="PAN / VAT Number">
              <FInput placeholder="12345678" {...register('taxNumber')} />
            </Field>
            <Field label="Currency">
              <FSelect {...register('currency')}>
                <option value="NPR">NPR (Nepali Rupee)</option>
                <option value="USD">USD</option>
                <option value="INR">INR</option>
              </FSelect>
            </Field>
            <Field label="Fiscal Year Start">
              <FSelect {...register('fiscalYearStart')}>
                {MONTHS_BS.map(m => <option key={m} value={m}>{m}</option>)}
              </FSelect>
            </Field>
          </div>
          <Field label="Address">
            <textarea rows={2} placeholder="Full business address…"
              className="w-full px-3 py-2.5 rounded-lg text-[13px] outline-none resize-none"
              style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)', color: 'var(--text-primary)' }}
              {...register('address')} />
          </Field>
          <SaveBtn isPending={saveMutation.isPending} />
        </form>
      </SectionCard>
    </div>
  )
}

// ── Notifications Tab ─────────────────────────────────────────────────────────
function NotificationsTab() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const { data: settings = {} } = useSettings()

  const DEFAULT_PREFS = {
    lowStockAlert:      true,
    outOfStockAlert:    true,
    overstockAlert:     false,
    reorderAlert:       true,
    emailNotifications: false,
  }

  const [prefs, setPrefs] = useState(DEFAULT_PREFS)

  // Sync when settings load
  useEffect(() => {
    const saved = settings.notifications
    if (saved) setPrefs(p => ({ ...p, ...saved }))
  }, [settings])

  const mutation = useMutation({
    mutationFn: (d) => axiosInstance.patch('/settings', { notifications: d }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      toast({ title: 'Notification preferences saved', variant: 'success' })
    },
    onError: () => toast({ title: 'Failed to save', variant: 'error' }),
  })

  const ITEMS = [
    { key: 'lowStockAlert',      label: 'Low Stock Alerts',    description: 'Notify when stock falls below reorder level' },
    { key: 'outOfStockAlert',    label: 'Out of Stock Alerts',  description: 'Notify when a product reaches zero stock' },
    { key: 'overstockAlert',     label: 'Overstock Alerts',     description: 'Notify when stock exceeds maximum level' },
    { key: 'reorderAlert',       label: 'Reorder Point Alerts', description: 'Notify when reorder point is reached' },
    { key: 'emailNotifications', label: 'Email Notifications',  description: 'Send alert summaries to company email' },
  ]

  return (
    <SectionCard title="Notification Preferences" description="Control which system alerts are generated">
      <div>
        {ITEMS.map(item => (
          <Toggle key={item.key}
            checked={prefs[item.key] ?? DEFAULT_PREFS[item.key]}
            onChange={() => setPrefs(p => ({ ...p, [item.key]: !p[item.key] }))}
            label={item.label}
            description={item.description}
          />
        ))}
      </div>
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(prefs) }}>
        <SaveBtn isPending={mutation.isPending} label="Save Preferences" />
      </form>
    </SectionCard>
  )
}

// ── AI Config Tab ─────────────────────────────────────────────────────────────
function AITab() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const { data: settings = {} } = useSettings()

  const DEFAULT_CFG = {
    defaultModel:       'random_forest',
    forecastDays:       30,
    trainingThreshold:  30,
    enableAutoForecast: true,
  }

  const [cfg, setCfg] = useState(DEFAULT_CFG)

  useEffect(() => {
    const saved = settings.aiConfig
    if (saved) setCfg(p => ({ ...p, ...saved }))
  }, [settings])

  const mutation = useMutation({
    mutationFn: (d) => axiosInstance.patch('/settings', { aiConfig: d }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      toast({ title: 'AI configuration saved', variant: 'success' })
    },
    onError: () => toast({ title: 'Failed to save', variant: 'error' }),
  })

  const MODEL_OPTIONS = [
    { value: 'random_forest', label: 'Random Forest (Fast, Accurate)' },
    { value: 'xgboost',       label: 'XGBoost (High Performance)' },
    { value: 'lstm',          label: 'LSTM Neural Network (Deep Learning)' },
    { value: 'prophet',       label: 'Facebook Prophet (Seasonal)' },
  ]

  return (
    <SectionCard title="AI Forecasting Configuration" description="Control how the AI demand prediction service operates">
      <div className="space-y-4">
        <Field label="Default Forecast Model">
          <FSelect value={cfg.defaultModel} onChange={e => setCfg(p => ({ ...p, defaultModel: e.target.value }))}>
            {MODEL_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </FSelect>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Forecast Horizon (days)">
            <FInput type="number" min={7} max={90} value={cfg.forecastDays}
              onChange={e => setCfg(p => ({ ...p, forecastDays: parseInt(e.target.value) || 30 }))} />
          </Field>
          <Field label="Min Training Data (days)">
            <FInput type="number" min={7} max={365} value={cfg.trainingThreshold}
              onChange={e => setCfg(p => ({ ...p, trainingThreshold: parseInt(e.target.value) || 30 }))} />
          </Field>
        </div>
        <Toggle
          checked={cfg.enableAutoForecast}
          onChange={(v) => setCfg(p => ({ ...p, enableAutoForecast: v }))}
          label="Enable Automatic Forecasting"
          description="Run daily forecasts automatically for all products with sufficient sales history"
        />
      </div>
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(cfg) }}>
        <SaveBtn isPending={mutation.isPending} label="Save AI Config" />
      </form>
    </SectionCard>
  )
}

// ── Security Tab ──────────────────────────────────────────────────────────────
function SecurityTab() {
  const { toast } = useToast()
  const [show, setShow] = useState({ current: false, new: false, confirm: false })

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(passwordSchema),
  })

  const mutation = useMutation({
    mutationFn: (d) => axiosInstance.post('/auth/change-password', d),
    onSuccess: () => {
      toast({ title: 'Password changed successfully', variant: 'success' })
      reset()
    },
    onError: (e) => toast({ title: e.response?.data?.message || 'Incorrect current password', variant: 'error' }),
  })

  const PwField = ({ name, label, placeholder, showKey }) => (
    <Field label={label} error={errors[name]?.message}>
      <div className="relative">
        <FInput type={show[showKey] ? 'text' : 'password'} placeholder={placeholder}
          error={!!errors[name]} {...register(name)} />
        <button type="button" onClick={() => setShow(p => ({ ...p, [showKey]: !p[showKey] }))}
          className="absolute right-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--text-muted)' }}>
          {show[showKey] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </Field>
  )

  return (
    <SectionCard title="Change Password" description="Update your account password. You will remain logged in.">
      <form onSubmit={handleSubmit(mutation.mutate)} className="space-y-4">
        <PwField name="currentPassword" label="Current Password" placeholder="••••••••" showKey="current" />
        <PwField name="newPassword"     label="New Password"     placeholder="At least 8 characters + 1 number" showKey="new" />
        <PwField name="confirmPassword" label="Confirm New Password" placeholder="Repeat new password" showKey="confirm" />
        <SaveBtn isPending={mutation.isPending} label="Change Password" />
      </form>
    </SectionCard>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { isAdmin } = useRole()
  const [activeTab, setTab] = useState(isAdmin ? 'company' : 'security')

  const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin)

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-[22px] font-bold" style={{ color: 'var(--text-primary)' }}>Settings</h1>
        <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
          Manage system configuration and preferences
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--surface-muted)' }}>
        {visibleTabs.map(tab => {
          const Icon = tab.Icon
          const active = activeTab === tab.key
          return (
            <button key={tab.key} onClick={() => setTab(tab.key)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all"
              style={{
                background: active ? 'var(--surface-card)' : 'transparent',
                color:      active ? 'var(--brand)' : 'var(--text-muted)',
                boxShadow:  active ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
              }}>
              <Icon className="h-4 w-4" />{tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'company'       && <CompanyTab />}
      {activeTab === 'notifications' && <NotificationsTab />}
      {activeTab === 'ai'            && <AITab />}
      {activeTab === 'security'      && <SecurityTab />}
    </div>
  )
}
