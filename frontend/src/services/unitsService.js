import axiosInstance from '@/api/axiosInstance'
import { buildQueryString } from '@/utils'

export const unitsService = {
  getAll: (params = {}) =>
    axiosInstance.get(`/units?${buildQueryString(params)}`),

  getById: (id) => axiosInstance.get(`/units/${id}`),

  getByType: () => axiosInstance.get('/units/by-type'),

  getStats: () => axiosInstance.get('/units/stats'),

  getSymbols: () => axiosInstance.get('/units/symbols'),

  create: (data) => axiosInstance.post('/units', data),

  update: (id, data) => axiosInstance.patch(`/units/${id}`, data),

  delete: (id) => axiosInstance.delete(`/units/${id}`),
}
