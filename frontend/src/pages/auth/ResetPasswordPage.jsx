import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Lock, Eye, EyeOff, Zap, CheckCircle, AlertOctagon, Clock } from 'lucide-react'
import { motion } from 'framer-motion'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { authService } from '@/services/authService'
import { APP_NAME } from '@/constants'

const schema = z.object({
  password: z.string()
    .min(8,                 'Password must be at least 8 characters')
    .regex(/[A-Z]/,         'Must contain at least one uppercase letter')
    .regex(/[a-z]/,         'Must contain at least one lowercase letter')
    .regex(/\d/,            'Must contain at least one number')
    .regex(/[^a-zA-Z0-9]/, 'Must contain at least one special character'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

function getStrength(pw) {
  if (!pw) return { score: 0, label: '', color: '' }
  let score = 0
  if (pw.length >= 8)           score++
  if (/[A-Z]/.test(pw))         score++
  if (/[a-z]/.test(pw))         score++
  if (/\d/.test(pw))            score++
  if (/[^a-zA-Z0-9]/.test(pw)) score++
  if (score <= 2) return { score, label: 'Weak',   color: '#EF4444' }
  if (score === 3) return { score, label: 'Fair',   color: '#F59E0B' }
  if (score === 4) return { score, label: 'Good',   color: '#3B82F6' }
  return                       { score, label: 'Strong', color: '#16A34A' }
}

// Shared card style
const cardStyle = {
  width:        '100%',
  maxWidth:     '440px',
  background:   '#FFFFFF',
  border:       '1px solid #E5E7EB',
  borderRadius: '20px',
  padding:      '40px',
  boxShadow:    '0 4px 24px rgba(0,0,0,.06)',
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

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  })

  const passwordValue = watch('password', '')
  const strength      = getStrength(passwordValue)

  const onSubmit = async ({ password }) => {
    setLoading(true)
    setServerError(null)
    setIsExpired(false)
    try {
      await authService.resetPassword(token, { password })
      setSuccess(true)
      setTimeout(() => navigate('/login'), 3000)
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

  const inputStyle = hasError => ({
    background:   '#FFFFFF',
    border:       `1.5px solid ${hasError ? '#EF4444' : '#E5E7EB'}`,
    borderRadius: '10px',
    padding:      '12px 44px 12px 40px',
    color:        '#111827',
    width:        '100%',
    fontSize:     14,
    outline:      'none',
    transition:   'border-color .15s',
  })

  // ── Expired-link state ────────────────────────────────────────────────────────
  if (isExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#F3F4F6' }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }} style={{ ...cardStyle, textAlign: 'center' }}>
          <div className="flex items-center justify-center mb-5">
            <div className="h-16 w-16 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(217,119,6,.1)', border: '2px solid rgba(217,119,6,.25)' }}>
              <Clock className="h-8 w-8" style={{ color: '#D97706' }} />
            </div>
          </div>
          <h3 className="text-[22px] font-bold mb-2" style={{ color: '#111827' }}>Link expired</h3>
          <p className="text-[14px] mb-6" style={{ color: '#6B7280' }}>
            This reset link has expired (links are valid for 15 minutes). Please request a new one.
          </p>
          <Link to="/forgot-password"
            className="inline-block w-full rounded-xl py-3.5 text-[14px] font-bold text-white text-center"
            style={{ background: '#03045e', boxShadow: '0 4px 20px rgba(3,4,94,.35)' }}>
            Request New Reset Link
          </Link>
          <div className="mt-4">
            <Link to="/login" className="text-[13px] font-medium" style={{ color: '#9CA3AF' }}
              onMouseEnter={e => e.currentTarget.style.color = '#2563EB'}
              onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}>
              Back to sign in
            </Link>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#F3F4F6' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }} style={cardStyle}>

        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center"
            style={{ background: '#03045e', boxShadow: '0 4px 16px rgba(3,4,94,.35)' }}>
            <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[17px] font-bold" style={{ color: '#111827' }}>{APP_NAME}</span>
        </div>

        {!success ? (
          <>
            <h2 className="text-[26px] font-bold mb-1" style={{ color: '#111827' }}>Set new password</h2>
            <p className="text-[14px] mb-7" style={{ color: '#6B7280' }}>
              Choose a strong password for your account.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

              {/* New password */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5"
                  style={{ color: '#6B7280' }}>
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#9CA3AF' }} />
                  <input
                    type={showPw ? 'text' : 'password'}
                    placeholder="••••••••"
                    style={inputStyle(errors.password)}
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

                {/* Strength meter */}
                {passwordValue && (
                  <div className="mt-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} style={{
                          height: 3, flex: 1, borderRadius: 99,
                          background: i <= strength.score ? strength.color : '#E5E7EB',
                          transition: 'background 0.25s',
                        }} />
                      ))}
                    </div>
                    <p className="text-[11px] mt-1 font-medium" style={{ color: strength.color }}>
                      {strength.label}
                    </p>
                  </div>
                )}

                {errors.password && (
                  <p className="text-[11px] mt-1" style={{ color: '#EF4444' }}>{errors.password.message}</p>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5"
                  style={{ color: '#6B7280' }}>
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#9CA3AF' }} />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="••••••••"
                    style={inputStyle(errors.confirmPassword)}
                    onFocus={e => { if (!errors.confirmPassword) e.target.style.borderColor = '#2563EB' }}
                    onBlur={e  => { if (!errors.confirmPassword) e.target.style.borderColor = '#E5E7EB' }}
                    {...register('confirmPassword')}
                  />
                  <button type="button" onClick={() => setShowConfirm(p => !p)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2"
                    style={{ color: '#9CA3AF' }}>
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-[11px] mt-1" style={{ color: '#EF4444' }}>{errors.confirmPassword.message}</p>
                )}
              </div>

              {/* Server error */}
              {serverError && (
                <div className="flex items-center gap-2 rounded-lg p-3"
                  style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
                  <AlertOctagon className="h-4 w-4 shrink-0" style={{ color: '#DC2626' }} />
                  <span className="text-[13px]" style={{ color: '#991B1B' }}>{serverError}</span>
                </div>
              )}

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
                    Resetting…
                  </span>
                ) : 'Reset Password'}
              </button>
            </form>
          </>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
            <div className="flex items-center justify-center mb-5">
              <div className="h-16 w-16 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(22,163,74,.1)', border: '2px solid rgba(22,163,74,.25)' }}>
                <CheckCircle className="h-8 w-8" style={{ color: '#16A34A' }} />
              </div>
            </div>
            <h3 className="text-[22px] font-bold mb-2" style={{ color: '#111827' }}>Password reset!</h3>
            <p className="text-[14px]" style={{ color: '#6B7280' }}>
              Redirecting you to login in 3 seconds…
            </p>
          </motion.div>
        )}

        {!success && !isExpired && (
          <div className="mt-6 text-center">
            <Link to="/login" className="text-[13px] font-medium" style={{ color: '#9CA3AF' }}
              onMouseEnter={e => e.currentTarget.style.color = '#2563EB'}
              onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}>
              Back to sign in
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  )
}
