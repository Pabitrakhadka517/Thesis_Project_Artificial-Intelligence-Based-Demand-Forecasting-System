import axios from 'axios'
import { TOKEN_KEY, REFRESH_TOKEN_KEY, API_BASE_URL } from '@/constants'

const axiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// Injected after store creation to avoid a circular import
// (axiosInstance → store → authSlice → authService → axiosInstance)
let _dispatch = null
export function injectAxiosDispatch(dispatch) {
  _dispatch = dispatch
}

// Attach access token to every request
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error)
)

function forceLogout() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  if (_dispatch) _dispatch({ type: 'auth/forceLogout' })
}

// Shared across concurrent 401s so a burst of requests triggers one refresh
// call, not one per request (the API also rotates the refresh token itself,
// so parallel calls would race and invalidate each other).
let refreshPromise = null

function refreshTokens() {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
  if (!refreshToken) return Promise.reject(new Error('No refresh token'))

  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE_URL}/api/v1/auth/refresh-token`, { refreshToken })
      .then((res) => res.data?.data)
      .finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

// Handle 401/403 — dispatch forceLogout so Redux state is cleared synchronously
// and React Router guards navigate to /login cleanly (no hard reload needed).
// 403 "Account deactivated" is treated as force-logout (server revokes all tokens).
// On a plain 401 (expired access token), attempt one silent refresh-and-retry
// before giving up — using a bare `axios` call (not axiosInstance) so the
// refresh request itself doesn't recurse through this same interceptor.
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status  = error.response?.status
    const message = error.response?.data?.message || ''
    const isDeactivated = status === 403 && message.toLowerCase().includes('deactivated')
    const original = error.config

    if (isDeactivated) {
      forceLogout()
      return Promise.reject(error)
    }

    // Only attempt a refresh if a session actually exists — otherwise a 401
    // from e.g. a failed login (wrong password, no token yet) would trigger
    // a pointless refresh attempt before the real error reaches the caller.
    const hasSession   = !!localStorage.getItem(TOKEN_KEY)
    const isRefreshCall = original?.url?.includes('/auth/refresh-token')
    if (status === 401 && original && hasSession && !original._isRetry && !isRefreshCall) {
      original._isRetry = true
      try {
        const tokens = await refreshTokens()
        if (!tokens?.accessToken) throw new Error('Refresh response missing access token')

        localStorage.setItem(TOKEN_KEY, tokens.accessToken)
        if (tokens.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken)

        original.headers = original.headers || {}
        original.headers.Authorization = `Bearer ${tokens.accessToken}`
        return axiosInstance(original)
      } catch {
        forceLogout()
        return Promise.reject(error)
      }
    }

    if (status === 401) {
      forceLogout()
    }
    return Promise.reject(error)
  }
)

export default axiosInstance
