import { Outlet, Navigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { selectIsAuthenticated, selectUser } from '@/store/slices/authSlice'

export function AuthLayout() {
  const isAuthenticated = useSelector(selectIsAuthenticated)
  const user = useSelector(selectUser)

  // Only redirect once the role is known — prevents a double-redirect when
  // isAuthenticated=true but user=null (profile not yet loaded)
  if (isAuthenticated && user?.role) {
    const dest =
      user.role === 'admin'             ? '/admin/dashboard'   :
      user.role === 'inventory_manager' ? '/manager/dashboard' :
      '/staff/dashboard'
    return <Navigate to={dest} replace />
  }
  return <Outlet />
}
