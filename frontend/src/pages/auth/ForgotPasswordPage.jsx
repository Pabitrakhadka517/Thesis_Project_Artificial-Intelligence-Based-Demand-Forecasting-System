import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, ArrowLeft, CheckCircle, AlertOctagon } from 'lucide-react'
import logoIcon from '@/assets/logo-icon.png'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { authService } from '@/services/authService'
import { APP_NAME } from '@/constants'
import { Input } from '@/components/common/Input'
import { Button } from '@/components/common/Button'

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
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--surface-page)' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="rounded-2xl"
        style={{
          width:        '100%',
          maxWidth:     '440px',
          background:   'var(--surface-card)',
          border:       '1px solid var(--border)',
          padding:      '40px',
          boxShadow:    'var(--shadow-lg)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--brand-primary)' }}>
            <img src={logoIcon} className="h-6 w-6 object-contain" alt="" />
          </div>
          <span className="text-[17px] font-bold" style={{ color: 'var(--text-primary)' }}>{APP_NAME}</span>
        </div>

        {!submitted ? (
          <>
            <h2 className="text-[26px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Forgot password?</h2>
            <p className="text-[14px] mb-7" style={{ color: 'var(--text-muted)' }}>
              Enter your email and we'll send a reset link.
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

              {serverError && (
                <div className="flex items-center gap-2 rounded-lg p-3" role="alert"
                  style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)' }}>
                  <AlertOctagon className="h-4 w-4 shrink-0" style={{ color: 'var(--color-danger)' }} />
                  <span className="text-[13px]" style={{ color: 'var(--color-danger)' }}>{serverError}</span>
                </div>
              )}

              <Button type="submit" loading={loading} size="lg" className="w-full">
                {loading ? 'Sending…' : 'Send Reset Link'}
              </Button>
            </form>
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="text-center"
          >
            <div className="flex items-center justify-center mb-5">
              <div className="h-16 w-16 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(22,163,74,.1)', border: '2px solid rgba(22,163,74,.25)' }}>
                <CheckCircle className="h-8 w-8" style={{ color: 'var(--brand-green)' }} />
              </div>
            </div>
            <h3 className="text-[22px] font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Check your inbox</h3>
            <p className="text-[14px] mb-1" style={{ color: 'var(--text-muted)' }}>
              We've sent a password reset link to
            </p>
            <p className="text-[14px] font-semibold mb-6" style={{ color: 'var(--brand-blue)' }}>
              {getValues('email')}
            </p>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              The link expires in 15 minutes. Check your spam folder if you don't see it.
            </p>
          </motion.div>
        )}

        <div className="mt-6 text-center">
          <Link to="/login"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--brand-blue)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
