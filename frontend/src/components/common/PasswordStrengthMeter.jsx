import { getPasswordStrength } from '@/schemas/password'

// Reused everywhere a new password is being set (Register, Reset, Setup
// Wizard) so password-strength feedback isn't a one-off feature of a single
// screen.
export function PasswordStrengthMeter({ value }) {
  if (!value) return null
  const strength = getPasswordStrength(value)
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{
            height: 3, flex: 1, borderRadius: 99,
            background: i <= strength.score ? strength.color : 'var(--border)',
            transition: 'background 0.25s',
          }} />
        ))}
      </div>
      <p className="text-[11px] mt-1 font-medium" style={{ color: strength.color }}>
        {strength.label}
      </p>
    </div>
  )
}
