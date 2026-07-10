import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { changePasswordSchema } from '@/schemas/changePassword'
import { Input } from './Input'
import { Button } from './Button'
import { PasswordStrengthMeter } from './PasswordStrengthMeter'

// Shared by ProfilePage and Settings' Security tab — previously each screen
// had its own near-duplicate password-change form with a different
// currentPassword validation rule.
export function ChangePasswordForm({ onSubmit, loading, submitLabel = 'Update Password' }) {
  const [show, setShow] = useState({ current: false, next: false, confirm: false })
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm({
    resolver: zodResolver(changePasswordSchema),
  })
  const newPasswordValue = watch('newPassword', '')

  const submit = async (values) => {
    await onSubmit(values, { reset })
  }

  const toggle = (key) => (
    <button type="button" onClick={() => setShow(p => ({ ...p, [key]: !p[key] }))}
      aria-label={show[key] ? 'Hide password' : 'Show password'}
      style={{ color: 'var(--text-muted)' }}>
      {show[key] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
    </button>
  )

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <Input
        label="Current Password"
        type={show.current ? 'text' : 'password'}
        placeholder="••••••••"
        error={errors.currentPassword?.message}
        rightElement={toggle('current')}
        {...register('currentPassword')}
      />

      <div>
        <Input
          label="New Password"
          type={show.next ? 'text' : 'password'}
          placeholder="Min 8 chars, upper/lowercase, number & symbol"
          error={errors.newPassword?.message}
          rightElement={toggle('next')}
          {...register('newPassword')}
        />
        <PasswordStrengthMeter value={newPasswordValue} />
      </div>

      <Input
        label="Confirm New Password"
        type={show.confirm ? 'text' : 'password'}
        placeholder="••••••••"
        error={errors.confirmPassword?.message}
        rightElement={toggle('confirm')}
        {...register('confirmPassword')}
      />

      <Button type="submit" loading={loading}>{submitLabel}</Button>
    </form>
  )
}
