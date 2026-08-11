import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Building2, Bell, Cpu, Shield, Save, Settings as SettingsIcon } from 'lucide-react'
import axiosInstance from '@/api/axiosInstance'
import { useToast } from '@/hooks/useToast'
import { useRole } from '@/hooks/useRole'
import { ImageUpload } from '@/components/common/ImageUpload'
import { ChangePasswordForm } from '@/components/common/ChangePasswordForm'
import { UnsavedBanner } from '@/components/common/UnsavedBanner'
import { Input } from '@/components/common/Input'
import { Select } from '@/components/common/Select'
import { Textarea } from '@/components/common/Textarea'
import { Button } from '@/components/common/Button'
import { PageHeader } from '@/components/common/PageHeader'

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

// ── Shared UI components ──────────────────────────────────────────────────────
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
        role="switch" aria-checked={checked} aria-label={label}
        className="relative h-6 w-11 rounded-full transition-colors duration-200 shrink-0"
        style={{ background: checked ? 'var(--brand)' : 'var(--border)' }}>
        <span aria-hidden="true" className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200"
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }} />
      </button>
    </div>
  )
}

function SaveBtn({ isPending, label = 'Save Changes' }) {
  return (
    <Button type="submit" className="mt-5" icon={Save} disabled={isPending} loading={isPending}>
      {isPending ? 'Saving…' : label}
    </Button>
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

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm({
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
              <Button
                type="button"
                size="sm"
                className="mt-3"
                icon={Save}
                onClick={() => logoUploadMutation.mutate(pendingLogo)}
              >
                Save Logo
              </Button>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ── Company info form ── */}
      <SectionCard title="Company Information" description="Basic business details used on invoices and reports">
        <form onSubmit={handleSubmit(saveMutation.mutate)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Company Name *" placeholder="Himalayan Wholesale Suppliers" error={errors.companyName?.message} {...register('companyName')} />
            <Input label="Business Type" placeholder="Wholesale / Retail" {...register('businessType')} />
            <Input label="Phone" placeholder="+977-01-..." {...register('phone')} />
            <Input label="Email" type="email" placeholder="info@company.com" error={errors.email?.message} {...register('email')} />
            <Input label="PAN / VAT Number" placeholder="12345678" {...register('taxNumber')} />
            <Select label="Currency" {...register('currency')} options={[
              { value: 'NPR', label: 'NPR (Nepali Rupee)' },
              { value: 'USD', label: 'USD' },
              { value: 'INR', label: 'INR' },
            ]} />
            <Select label="Fiscal Year Start" {...register('fiscalYearStart')}
              options={MONTHS_BS.map(m => ({ value: m, label: m }))} />
          </div>
          <Textarea label="Address" rows={2} placeholder="Full business address…" {...register('address')} />
          <SaveBtn isPending={saveMutation.isPending} />
          {isDirty && <UnsavedBanner />}
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

  const [prefs, setPrefs]     = useState(DEFAULT_PREFS)
  const [savedPrefs, setSaved] = useState(DEFAULT_PREFS)
  const isDirty = JSON.stringify(prefs) !== JSON.stringify(savedPrefs)

  // Sync when settings load
  useEffect(() => {
    const saved = settings.notifications
    if (saved) {
      setPrefs(p => ({ ...p, ...saved }))
      setSaved(p => ({ ...p, ...saved }))
    }
  }, [settings])

  const mutation = useMutation({
    mutationFn: (d) => axiosInstance.patch('/settings', { notifications: d }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setSaved(vars)
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
        {isDirty && <UnsavedBanner />}
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

  const [cfg, setCfg]         = useState(DEFAULT_CFG)
  const [savedCfg, setSaved]  = useState(DEFAULT_CFG)
  const isDirty = JSON.stringify(cfg) !== JSON.stringify(savedCfg)

  useEffect(() => {
    const saved = settings.aiConfig
    if (saved) {
      setCfg(p => ({ ...p, ...saved }))
      setSaved(p => ({ ...p, ...saved }))
    }
  }, [settings])

  const mutation = useMutation({
    mutationFn: (d) => axiosInstance.patch('/settings', { aiConfig: d }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setSaved(vars)
      toast({ title: 'AI configuration saved', variant: 'success' })
    },
    onError: () => toast({ title: 'Failed to save', variant: 'error' }),
  })

  // Only models the ML service actually trains — Random Forest, LSTM, and
  // Prophet. (XGBoost was previously offered here with no corresponding
  // trained model anywhere in the analytics/forecast pipeline.)
  const MODEL_OPTIONS = [
    { value: 'random_forest', label: 'Random Forest (Fast, Accurate)' },
    { value: 'lstm',          label: 'LSTM Neural Network (Deep Learning)' },
    { value: 'prophet',       label: 'Facebook Prophet (Seasonal)' },
  ]

  return (
    <SectionCard title="AI Forecasting Configuration" description="Control how the AI demand prediction service operates">
      <div className="space-y-4">
        <Select label="Default Forecast Model" value={cfg.defaultModel}
          onChange={e => setCfg(p => ({ ...p, defaultModel: e.target.value }))}
          options={MODEL_OPTIONS} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Forecast Horizon (days)" type="number" min={7} max={90} value={cfg.forecastDays}
            onChange={e => setCfg(p => ({ ...p, forecastDays: parseInt(e.target.value) || 30 }))}
            hint={(cfg.forecastDays < 7 || cfg.forecastDays > 90) ? 'Recommended range: 7–90 days' : undefined} />
          <Input label="Min Training Data (days)" type="number" min={7} max={365} value={cfg.trainingThreshold}
            onChange={e => setCfg(p => ({ ...p, trainingThreshold: parseInt(e.target.value) || 30 }))}
            hint={(cfg.trainingThreshold < 7 || cfg.trainingThreshold > 365) ? 'Recommended range: 7–365 days' : undefined} />
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
        {isDirty && <UnsavedBanner />}
      </form>
    </SectionCard>
  )
}

// ── Security Tab ──────────────────────────────────────────────────────────────
function SecurityTab() {
  const { toast } = useToast()

  const mutation = useMutation({
    mutationFn: (d) => axiosInstance.post('/auth/change-password', d),
    onError: (e) => toast({ title: e.response?.data?.message || 'Incorrect current password', variant: 'error' }),
  })

  const handleSubmit = (values, { reset }) => {
    mutation.mutate(values, {
      onSuccess: () => {
        reset()
        toast({ title: 'Password changed successfully', variant: 'success' })
      },
    })
  }

  return (
    <SectionCard title="Change Password" description="Update your account password. You will remain logged in.">
      <ChangePasswordForm onSubmit={handleSubmit} loading={mutation.isPending} submitLabel="Change Password" />
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
      <PageHeader
        icon={SettingsIcon}
        eyebrow="Administration"
        title="Settings"
        subtitle="Manage system configuration and preferences"
      />

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
