import axiosInstance from '@/api/axiosInstance'
import { buildQueryString } from '@/utils'

export const categoriesService = {
  getAll: (params = {}) =>
    axiosInstance.get(`/categories?${buildQueryString(params)}`),

  getById: (id) => axiosInstance.get(`/categories/${id}`),

  getTree: () => axiosInstance.get('/categories/tree'),

  getStats: () => axiosInstance.get('/categories/stats'),

  create: (data) => axiosInstance.post('/categories', data),

  update: (id, data) => axiosInstance.patch(`/categories/${id}`, data),

  delete: (id) => axiosInstance.delete(`/categories/${id}`),
}
