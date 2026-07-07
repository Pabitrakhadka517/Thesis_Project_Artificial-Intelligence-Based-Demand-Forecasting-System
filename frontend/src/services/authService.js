import axiosInstance from '@/api/axiosInstance'

export const authService = {
  setupStatus:    ()           => axiosInstance.get('/auth/setup-status'),
  setup:          (data)       => axiosInstance.post('/auth/setup', data),
  login:          (data)       => axiosInstance.post('/auth/login', data),
  logout:         (data)       => axiosInstance.post('/auth/logout', data),
  refreshToken:   (data)       => axiosInstance.post('/auth/refresh-token', data),
  getProfile:     ()           => axiosInstance.get('/auth/me'),
  updateProfile:  (data)       => axiosInstance.patch('/auth/me', data),
  changePassword: (data)       => axiosInstance.post('/auth/change-password', data),
  forgotPassword: (data)       => axiosInstance.post('/auth/forgot-password', data),
  resetPassword:  (token, data)=> axiosInstance.post(`/auth/reset-password/${token}`, data),

  // ── Avatar upload / delete ────────────────────────────────────────────────
  uploadAvatar: (file) => {
    const form = new FormData()
    form.append('avatar', file)
    return axiosInstance.post('/auth/me/avatar', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  deleteAvatar: () => axiosInstance.delete('/auth/me/avatar'),
}
