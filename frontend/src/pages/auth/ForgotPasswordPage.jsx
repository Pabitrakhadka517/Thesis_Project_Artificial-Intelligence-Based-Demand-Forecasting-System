import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, ArrowLeft, Zap, CheckCircle, AlertOctagon } from 'lucide-react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { authService } from '@/services/authService'
import { APP_NAME } from '@/constants'

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
})

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted]     = useState(false)
  const [loading, setLoading]         = useState(false)
  const [serverError, setServerError] = useState(null)

  const { register, handleSubmit, getValues, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  })

  const onSubmit = async ({ email }) => {
    setLoading(true)
    setServerError(null)
    try {
      await authService.forgotPassword({ email })
      setSubmitted(true)
    } catch (err) {
      setServerError(err.response?.data?.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#F3F4F6' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{
          width:        '100%',
          maxWidth:     '440px',
          background:   '#FFFFFF',
          border:       '1px solid #E5E7EB',
          borderRadius: '20px',
          padding:      '40px',
          boxShadow:    '0 4px 24px rgba(0,0,0,.06)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center"
            style={{ background: '#03045e', boxShadow: '0 4px 16px rgba(3,4,94,.35)' }}>
            <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[17px] font-bold" style={{ color: '#111827' }}>{APP_NAME}</span>
        </div>

        {!submitted ? (
          <>
            <h2 className="text-[26px] font-bold mb-1" style={{ color: '#111827' }}>Forgot password?</h2>
            <p className="text-[14px] mb-7" style={{ color: '#6B7280' }}>
              Enter your email and we'll send a reset link.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5"
                  style={{ color: '#6B7280' }}>
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#9CA3AF' }} />
                  <input
                    type="email"
                    placeholder="your@email.com"
                    className="w-full text-[14px] outline-none"
                    style={{
                      background:   '#FFFFFF',
                      border:       `1.5px solid ${errors.email ? '#EF4444' : '#E5E7EB'}`,
                      borderRadius: '10px',
                      padding:      '12px 12px 12px 40px',
                      color:        '#111827',
                      transition:   'border-color .15s',
                    }}
                    onFocus={e => { if (!errors.email) e.target.style.borderColor = '#2563EB' }}
                    onBlur={e  => { if (!errors.email) e.target.style.borderColor = '#E5E7EB' }}
                    {...register('email')}
                  />
                </div>
                {errors.email && (
                  <p className="text-[11px] mt-1" style={{ color: '#EF4444' }}>{errors.email.message}</p>
                )}
              </div>

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
                    Sending…
                  </span>
                ) : 'Send Reset Link'}
              </button>
            </form>
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <div className="flex items-center justify-center mb-5">
              <div className="h-16 w-16 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(22,163,74,.1)', border: '2px solid rgba(22,163,74,.25)' }}>
                <CheckCircle className="h-8 w-8" style={{ color: '#16A34A' }} />
              </div>
            </div>
            <h3 className="text-[22px] font-bold mb-2" style={{ color: '#111827' }}>Check your inbox</h3>
            <p className="text-[14px] mb-1" style={{ color: '#6B7280' }}>
              We've sent a password reset link to
            </p>
            <p className="text-[14px] font-semibold mb-6" style={{ color: '#2563EB' }}>
              {getValues('email')}
            </p>
            <p className="text-[12px]" style={{ color: '#9CA3AF' }}>
              The link expires in 15 minutes. Check your spam folder if you don't see it.
            </p>
          </motion.div>
        )}

        <div className="mt-6 text-center">
          <Link to="/login"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium"
            style={{ color: '#9CA3AF' }}
            onMouseEnter={e => e.currentTarget.style.color = '#2563EB'}
            onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
