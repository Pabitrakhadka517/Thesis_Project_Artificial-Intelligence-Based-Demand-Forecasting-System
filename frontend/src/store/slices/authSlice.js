import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { authService } from '@/services/authService'
import { queryClient } from '@/api/queryClient'
import { TOKEN_KEY, REFRESH_TOKEN_KEY } from '@/constants'

// Node.js API returns: { success, message, data: { user, accessToken, refreshToken } }

const storeTokens = ({ accessToken, refreshToken }) => {
  if (accessToken)  localStorage.setItem(TOKEN_KEY, accessToken)
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

const clearTokens = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

export const login = createAsyncThunk(
  'auth/login',
  async (credentials, { rejectWithValue }) => {
    try {
      const { data: res } = await authService.login(credentials)
      storeTokens(res.data)
      return res.data // { user, accessToken, refreshToken }
    } catch (err) {
      const status  = err.response?.status
      const message = err.response?.data?.message || 'Invalid email or password'
      return rejectWithValue({ message, status })
    }
  }
)

export const register = createAsyncThunk(
  'auth/register',
  async (credentials, { rejectWithValue }) => {
    try {
      const { data: res } = await authService.register(credentials)
      storeTokens(res.data)
      return res.data // { user, accessToken, refreshToken }
    } catch (err) {
      const message = err.response?.data?.message || 'Registration failed'
      const errors  = err.response?.data?.errors
      return rejectWithValue({ message, errors })
    }
  }
)

export const fetchProfile = createAsyncThunk(
  'auth/fetchProfile',
  async (_, { rejectWithValue }) => {
    try {
      const { data: res } = await authService.getProfile()
      return res.data.user
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch profile')
    }
  }
)

export const logout = createAsyncThunk('auth/logout', async (_, { getState }) => {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
  try { await authService.logout({ refreshToken }) } catch { /* ignore */ }
  clearTokens()
  // Prevent the next user on this machine from seeing this user's cached
  // dashboard/product/report data before their own queries refetch.
  queryClient.clear()
})

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user:            null,
    token:           localStorage.getItem(TOKEN_KEY),
    isAuthenticated: !!localStorage.getItem(TOKEN_KEY),
    loading:         false,
    error:           null,
    errorStatus:     null,
  },
  reducers: {
    clearError: (state) => {
      state.error = null
      state.errorStatus = null
    },
    forceLogout: (state) => {
      state.user            = null
      state.token           = null
      state.isAuthenticated = false
      state.error           = null
      state.errorStatus     = null
      queryClient.clear()
    },
    updateUser: (state, action) => {
      state.user = { ...state.user, ...action.payload }
    },
    loginSuccess: (state, action) => {
      const { user, accessToken, refreshToken } = action.payload
      localStorage.setItem(TOKEN_KEY, accessToken)
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
      state.token           = accessToken
      state.user            = user
      state.isAuthenticated = true
      state.loading         = false
      state.error           = null
      state.errorStatus     = null
    },
  },
  extraReducers: (builder) => {
    builder
      // ── Login ──
      .addCase(login.pending, (state) => {
        state.loading     = true
        state.error       = null
        state.errorStatus = null
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading         = false
        state.token           = action.payload.accessToken
        state.user            = action.payload.user
        state.isAuthenticated = true
        state.error           = null
        state.errorStatus     = null
      })
      .addCase(login.rejected, (state, action) => {
        state.loading         = false
        state.error           = action.payload?.message || 'Login failed'
        state.errorStatus     = action.payload?.status  || null
        state.isAuthenticated = false
      })
      // ── Register ──
      .addCase(register.pending,   (state) => { state.loading = true; state.error = null })
      .addCase(register.fulfilled, (state, action) => {
        state.loading         = false
        state.token           = action.payload.accessToken
        state.user            = action.payload.user
        state.isAuthenticated = true
      })
      .addCase(register.rejected, (state, action) => {
        state.loading         = false
        state.error           = action.payload?.message || 'Registration failed'
        state.isAuthenticated = false
      })
      // ── Fetch Profile ──
      .addCase(fetchProfile.fulfilled, (state, action) => {
        state.user = action.payload
      })
      .addCase(fetchProfile.rejected, (state) => {
        state.user            = null
        state.token           = null
        state.isAuthenticated = false
        clearTokens()
        queryClient.clear()
      })
      // ── Logout ──
      .addCase(logout.fulfilled, (state) => {
        state.user            = null
        state.token           = null
        state.isAuthenticated = false
      })
  },
})

export const { clearError, forceLogout, updateUser, loginSuccess } = authSlice.actions

export const selectAuth            = (state) => state.auth
export const selectUser            = (state) => state.auth.user
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated
export const selectAuthLoading     = (state) => state.auth.loading
export const selectAuthError       = (state) => state.auth.error
export const selectErrorStatus     = (state) => state.auth.errorStatus

export default authSlice.reducer
