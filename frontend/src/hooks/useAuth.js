import { useCallback } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  selectUser,
  selectIsAuthenticated,
  selectAuthLoading,
  selectAuthError,
  login as loginAction,
  logout as logoutAction,
  register as registerAction,
  fetchProfile,
  clearError,
} from '@/store/slices/authSlice'

function roleHome(user) {
  switch (user?.role) {
    case 'admin':              return '/admin/dashboard'
    case 'inventory_manager':  return '/manager/dashboard'
    case 'staff':              return '/staff/dashboard'
    default:                   return '/login'
  }
}

export function useAuth() {
  const dispatch        = useDispatch()
  const navigate        = useNavigate()
  const user            = useSelector(selectUser)
  const isAuthenticated = useSelector(selectIsAuthenticated)
  const loading         = useSelector(selectAuthLoading)
  const error           = useSelector(selectAuthError)

  const login = useCallback(async (credentials) => {
    const result = await dispatch(loginAction(credentials))
    if (loginAction.fulfilled.match(result)) {
      navigate(roleHome(result.payload?.user))
    }
    return result
  }, [dispatch, navigate])

  const register = useCallback(async (credentials) => {
    const result = await dispatch(registerAction(credentials))
    if (registerAction.fulfilled.match(result)) {
      navigate(roleHome(result.payload?.user))
    }
    return result
  }, [dispatch, navigate])

  const logout = useCallback(async () => {
    await dispatch(logoutAction())
    navigate('/login')
  }, [dispatch, navigate])

  const refreshProfile = useCallback(() => dispatch(fetchProfile()), [dispatch])
  const doClearError   = useCallback(() => dispatch(clearError()),    [dispatch])

  return {
    user,
    isAuthenticated,
    loading,
    error,
    login,
    register,
    logout,
    refreshProfile,
    clearError: doClearError,
    roleHome,
  }
}
