import { z } from 'zod'
import { passwordSchema } from './password'

// Shared "change password" schema — previously ProfilePage and Settings'
// Security tab each defined their own (with a drifting currentPassword rule:
// min(6) vs min(1)). The new-password half now reuses the app's one
// canonical password policy instead of a third, weaker one-off rule.
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Required'),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})
