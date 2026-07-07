import axiosInstance from '@/api/axiosInstance'
import { buildQueryString } from '@/utils'

export const purchaseService = {
  getAll:    (params = {}) => axiosInstance.get(`/purchases?${buildQueryString(params)}`),
  getById:   (id)          => axiosInstance.get(`/purchases/${id}`),
  getStats:  ()            => axiosInstance.get('/purchases/stats'),
  create:    (data)        => axiosInstance.post('/purchases', data),
  receive:   (id)          => axiosInstance.patch(`/purchases/${id}/receive`),
  delete:    (id)          => axiosInstance.delete(`/purchases/${id}`),
}
