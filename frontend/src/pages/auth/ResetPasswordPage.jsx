import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Lock, Eye, EyeOff, Zap, CheckCircle, AlertOctagon, Clock } from 'lucide-react'
import { motion } from 'framer-motion'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { authService } from '@/services/authService'
import { APP_NAME } from '@/constants'
import { passwordSchema } from '@/schemas/password'
import { Input } from '@/components/common/Input'
import { Button } from '@/components/common/Button'
import { PasswordStrengthMeter } from '@/components/common/PasswordStrengthMeter'

const schema = z.object({
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

// Shared card style
const cardStyle = {
  width:        '100%',
  maxWidth:     '440px',
  background:   'var(--surface-card)',
  border:       '1px solid var(--border)',
  padding:      '40px',
  boxShadow:    'var(--shadow-lg)',
}

export default function ResetPasswordPage() {
  const { token }                     = useParams()
  const navigate                      = useNavigate()
  const [showPw, setShowPw]           = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [success, setSuccess]         = useState(false)
  const [serverError, setServerError] = useState(null)
  const [isExpired, setIsExpired]     = useState(false)
  const [countdown, setCountdown]     = useState(3)

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  })

  const passwordValue = watch('password', '')

  useEffect(() => {
    if (!success) return
    if (countdown <= 0) { navigate('/login'); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [success, countdown, navigate])

  const onSubmit = async ({ password }) => {
    setLoading(true)
    setServerError(null)
    setIsExpired(false)
    try {
      await authService.resetPassword(token, { password })
      setSuccess(true)
    } catch (err) {
      const status = err.response?.status
      if (status === 410) {
        setIsExpired(true)
      } else {
        setServerError(err.response?.data?.message || 'Reset failed. The link may be invalid.')
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Expired-link state ────────────────────────────────────────────────────────
  if (isExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--surface-page)' }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }} className="rounded-2xl" style={{ ...cardStyle, textAlign: 'center' }}>
          <div className="flex items-center justify-center mb-5">
            <div className="h-16 w-16 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(217,119,6,.1)', border: '2px solid rgba(217,119,6,.25)' }}>
              <Clock className="h-8 w-8" style={{ color: '#D97706' }} />
            </div>
          </div>
          <h3 className="text-[22px] font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Link expired</h3>
          <p className="text-[14px] mb-6" style={{ color: 'var(--text-muted)' }}>
            This reset link has expired (links are valid for 15 minutes). Please request a new one.
          </p>
          <Link to="/forgot-password">
            <Button size="lg" className="w-full">Request New Reset Link</Button>
          </Link>
          <div className="mt-4">
            <Link to="/login" className="text-[13px] font-medium" style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => e.currentTarget.style.color = '#2563EB'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
              Back to sign in
            </Link>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--surface-page)' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }} className="rounded-2xl" style={cardStyle}>

        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--brand-primary)', boxShadow: '0 4px 16px rgba(3,4,94,.35)' }}>
            <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[17px] font-bold" style={{ color: 'var(--text-primary)' }}>{APP_NAME}</span>
        </div>

        {!success ? (
          <>
            <h2 className="text-[26px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Set new password</h2>
            <p className="text-[14px] mb-7" style={{ color: 'var(--text-muted)' }}>
              Choose a strong password for your account.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Input
                  label="New Password"
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
                type={showConfirm ? 'text' : 'password'}
                icon={Lock}
                placeholder="••••••••"
                error={errors.confirmPassword?.message}
                rightElement={
                  <button type="button" onClick={() => setShowConfirm(p => !p)}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                    style={{ color: 'var(--text-muted)' }}>
                    {showConfirm ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                }
                {...register('confirmPassword')}
              />

              {/* Server error */}
              {serverError && (
                <div className="flex items-center gap-2 rounded-lg p-3" role="alert"
                  style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
                  <AlertOctagon className="h-4 w-4 shrink-0" style={{ color: '#DC2626' }} />
                  <span className="text-[13px]" style={{ color: '#991B1B' }}>{serverError}</span>
                </div>
              )}

              <Button type="submit" loading={loading} size="lg" className="w-full">
                {loading ? 'Resetting…' : 'Reset Password'}
              </Button>
            </form>
          </>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="text-center">
            <div className="flex items-center justify-center mb-5">
              <div className="h-16 w-16 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(22,163,74,.1)', border: '2px solid rgba(22,163,74,.25)' }}>
                <CheckCircle className="h-8 w-8" style={{ color: '#16A34A' }} />
              </div>
            </div>
            <h3 className="text-[22px] font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Password reset!</h3>
            <p className="text-[14px]" style={{ color: 'var(--text-muted)' }}>
              Redirecting you to login in {countdown} second{countdown !== 1 ? 's' : ''}…
            </p>
          </motion.div>
        )}

        {!success && !isExpired && (
          <div className="mt-6 text-center">
            <Link to="/login" className="text-[13px] font-medium" style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => e.currentTarget.style.color = '#2563EB'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
              Back to sign in
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  )
}
