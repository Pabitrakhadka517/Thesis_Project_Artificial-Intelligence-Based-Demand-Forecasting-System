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

// Handle 401/403 — dispatch forceLogout so Redux state is cleared synchronously
// and React Router guards navigate to /login cleanly (no hard reload needed).
// 403 "Account deactivated" is treated as force-logout (server revokes all tokens).
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const status  = error.response?.status
    const message = error.response?.data?.message || ''
    const isDeactivated = status === 403 && message.toLowerCase().includes('deactivated')

    if (status === 401 || isDeactivated) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(REFRESH_TOKEN_KEY)
      if (_dispatch) {
        _dispatch({ type: 'auth/forceLogout' })
      }
    }
    return Promise.reject(error)
  }
)

export default axiosInstance
