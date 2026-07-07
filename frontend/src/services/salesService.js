import axiosInstance from '@/api/axiosInstance'
import { buildQueryString } from '@/utils'

export const salesService = {
  getAll:    (params = {}) => axiosInstance.get(`/sales?${buildQueryString(params)}`),
  getById:   (id)          => axiosInstance.get(`/sales/${id}`),
  getStats:  ()            => axiosInstance.get('/sales/stats'),
  getTrend:  (days = 30)   => axiosInstance.get(`/sales/trend?days=${days}`),
  create:    (data)        => axiosInstance.post('/sales', data),
  voidSale:  (id)          => axiosInstance.delete(`/sales/${id}`),
}
