import { z } from 'zod'

// Single source of truth for "setting a new password" (register, reset,
// setup wizard). Login keeps its own lighter check since it's validating an
// existing credential, not creating one.
export const passwordSchema = z.string()
  .min(8,                'Password must be at least 8 characters')
  .regex(/[A-Z]/,        'Must contain at least one uppercase letter')
  .regex(/[a-z]/,        'Must contain at least one lowercase letter')
  .regex(/\d/,           'Must contain at least one number')
  .regex(/[^a-zA-Z0-9]/, 'Must contain at least one special character')

export function getPasswordStrength(pw) {
  if (!pw) return { score: 0, label: '', color: '' }
  let score = 0
  if (pw.length >= 8)          score++
  if (/[A-Z]/.test(pw))        score++
  if (/[a-z]/.test(pw))        score++
  if (/\d/.test(pw))           score++
  if (/[^a-zA-Z0-9]/.test(pw)) score++
  if (score <= 2) return { score, label: 'Weak',   color: '#EF4444' }
  if (score === 3) return { score, label: 'Fair',   color: '#F59E0B' }
  if (score === 4) return { score, label: 'Good',   color: '#3B82F6' }
  return                  { score, label: 'Strong', color: '#16A34A' }
}
