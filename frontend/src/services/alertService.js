import axiosInstance from '@/api/axiosInstance'
import { buildQueryString } from '@/utils'

export const alertService = {
  getAlerts:    (params = {}) => axiosInstance.get(`/alerts?${buildQueryString(params)}`),
  getAlert:     (id)          => axiosInstance.get(`/alerts/${id}`),
  getUnreadCount: ()          => axiosInstance.get('/alerts/unread-count'),
  generate:     ()            => axiosInstance.post('/alerts/generate'),
  markRead:     (id)          => axiosInstance.patch(`/alerts/${id}/read`),
  markAllRead:  ()            => axiosInstance.patch('/alerts/mark-all-read'),
  acknowledge:  (id)          => axiosInstance.patch(`/alerts/${id}/acknowledge`),
  deleteAlert:  (id)          => axiosInstance.delete(`/alerts/${id}`),
}
