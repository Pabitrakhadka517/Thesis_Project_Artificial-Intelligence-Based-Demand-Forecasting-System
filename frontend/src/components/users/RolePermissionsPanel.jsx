import { useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { ROLE_PERMISSIONS } from '@/constants/roles'

// So an admin assigning a role can make an informed choice instead of
// guessing from a label — this explanation previously only existed on the
// pre-login marketing page, unreachable from inside the app.
export function RolePermissionsPanel() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl" style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          What can each role do?
        </span>
        <ChevronDown
          className="h-4 w-4 transition-transform"
          style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-3 gap-3" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          {ROLE_PERMISSIONS.map(role => (
            <div key={role.value} className="rounded-lg p-3.5" style={{ background: 'var(--surface-muted)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12.5px] font-bold" style={{ color: 'var(--text-primary)' }}>{role.label}</span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ background: 'var(--surface-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  {role.badge}
                </span>
              </div>
              <p className="text-[11.5px] mb-2" style={{ color: 'var(--text-muted)' }}>{role.desc}</p>
              <ul className="space-y-1">
                {role.perms.map(p => (
                  <li key={p} className="flex items-start gap-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    <Check className="h-3 w-3 mt-0.5 shrink-0" style={{ color: '#22C55E' }} />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
