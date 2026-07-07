import { useEffect, useRef } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { useQuery } from '@tanstack/react-query'
import { selectIsAuthenticated, selectUser, fetchProfile } from '@/store/slices/authSlice'
import { PageLoader } from '@/components/common/PageLoader'
import { authService } from '@/services/authService'

function useAuthGuard() {
  const dispatch        = useDispatch()
  const isAuthenticated = useSelector(selectIsAuthenticated)
  const user            = useSelector(selectUser)
  const fetchingRef     = useRef(false)

  useEffect(() => {
    if (isAuthenticated && !user && !fetchingRef.current) {
      fetchingRef.current = true
      dispatch(fetchProfile()).finally(() => { fetchingRef.current = false })
    }
  }, [isAuthenticated, user, dispatch])

  return { isAuthenticated, user, resolving: isAuthenticated && !user }
}

function roleDashboard(role) {
  switch (role) {
    case 'admin':             return '/admin/dashboard'
    case 'inventory_manager': return '/manager/dashboard'
    case 'staff':             return '/staff/dashboard'
    default:                  return '/login'
  }
}

// ── Root redirect based on role ───────────────────────────────────────────────
export function RootRedirect() {
  const { isAuthenticated, user, resolving } = useAuthGuard()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (resolving)         return <PageLoader />
  return <Navigate to={roleDashboard(user?.role)} replace />
}

// ── Admin only ────────────────────────────────────────────────────────────────
export function AdminGuard() {
  const { isAuthenticated, user, resolving } = useAuthGuard()
  const location = useLocation()

  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
  if (resolving)        return <PageLoader />
  if (user?.role !== 'admin') return <Navigate to={roleDashboard(user?.role)} replace />
  return <Outlet />
}

// ── Admin + Inventory Manager ─────────────────────────────────────────────────
export function ManagerGuard() {
  const { isAuthenticated, user, resolving } = useAuthGuard()
  const location = useLocation()

  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
  if (resolving)        return <PageLoader />
  if (user?.role === 'staff') return <Navigate to="/staff/dashboard" replace />
  return <Outlet />
}

// ── Any authenticated user (Staff+) ──────────────────────────────────────────
export function StaffGuard() {
  const { isAuthenticated, resolving } = useAuthGuard()
  const location = useLocation()

  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
  if (resolving)        return <PageLoader />
  return <Outlet />
}

// ── Setup gate — redirects to /setup if no admin exists yet ──────────────────
export function SetupGate({ children }) {
  const location = useLocation()
  const { data, isLoading } = useQuery({
    queryKey: ['setup-status'],
    queryFn: () => authService.setupStatus().then(r => r.data?.data),
    staleTime: 15 * 60_000,
    gcTime:    15 * 60_000,
    retry: 1,
  })

  if (isLoading) return <PageLoader />

  const setupRequired = data?.setupRequired ?? false
  const onSetup = location.pathname === '/setup'

  if (setupRequired && !onSetup) return <Navigate to="/setup" replace />
  if (!setupRequired && onSetup) return <Navigate to="/login" replace />

  return children
}

// ── Legacy alias ─────────────────────────────────────────────────────────────
export const UserGuard = StaffGuard

export function ProtectedRoute({ children }) {
  const { isAuthenticated, resolving } = useAuthGuard()
  const location = useLocation()

  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
  if (resolving)        return <PageLoader />
  return children
}
