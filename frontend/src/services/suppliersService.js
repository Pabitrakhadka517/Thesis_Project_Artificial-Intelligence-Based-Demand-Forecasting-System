import axiosInstance from '@/api/axiosInstance'
import { buildQueryString } from '@/utils'

export const suppliersService = {
  getAll:        (params = {}) => axiosInstance.get(`/suppliers?${buildQueryString(params)}`),
  get:           (id)          => axiosInstance.get(`/suppliers/${id}`),
  create:        (data)        => axiosInstance.post('/suppliers', data),
  update:        (id, data)    => axiosInstance.patch(`/suppliers/${id}`, data),
  delete:        (id)          => axiosInstance.delete(`/suppliers/${id}`),
  getForSelect:  ()            => axiosInstance.get('/suppliers/select'),
  getDashboard:  ()            => axiosInstance.get('/suppliers/dashboard'),
  getAnalytics:  ()            => axiosInstance.get('/suppliers/analytics'),
  getPerformance:(id)          => axiosInstance.get(`/suppliers/${id}/performance`),

  // ── Logo upload / delete ──────────────────────────────────────────────────
  uploadLogo: (id, file) => {
    const form = new FormData()
    form.append('logo', file)
    return axiosInstance.post(`/suppliers/${id}/logo`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  deleteLogo: (id) => axiosInstance.delete(`/suppliers/${id}/logo`),
}
