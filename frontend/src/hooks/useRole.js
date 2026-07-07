import { useSelector } from 'react-redux'
import { selectUser } from '@/store/slices/authSlice'

const ROLE_LEVELS = { admin: 3, inventory_manager: 2, staff: 1 }

export function useRole() {
  const user      = useSelector(selectUser)
  const role      = user?.role || 'staff'
  const level     = ROLE_LEVELS[role] || 1

  const isAdmin   = role === 'admin'
  const isManager = role === 'inventory_manager'
  const isStaff   = role === 'staff'

  // can('inventory_manager') → true if user is manager or admin
  const can = (minRole) => level >= (ROLE_LEVELS[minRole] || 0)

  const prefix = isAdmin ? '/admin' : isManager ? '/manager' : '/staff'

  const ROLE_LABELS = {
    admin:             'Administrator',
    inventory_manager: 'Inventory Manager',
    staff:             'Staff',
  }

  return {
    role,
    level,
    isAdmin,
    isManager,
    isStaff,
    can,
    prefix,
    label: ROLE_LABELS[role] || role,
  }
}
