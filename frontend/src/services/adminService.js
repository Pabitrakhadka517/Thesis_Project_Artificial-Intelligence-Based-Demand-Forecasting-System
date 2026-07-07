import axiosInstance from '@/api/axiosInstance'
import { buildQueryString } from '@/utils'

export const adminService = {
  // Users
  getUsers: (params = {}) =>
    axiosInstance.get(`/admin/users?${buildQueryString(params)}`),

  createUser: (data) => axiosInstance.post('/admin/users', data),

  updateUser: (id, data) => axiosInstance.put(`/admin/users/${id}`, data),

  deleteUser: (id) => axiosInstance.delete(`/admin/users/${id}`),

  // Audit Logs
  getAuditLogs: (params = {}) =>
    axiosInstance.get(`/users/audit-logs?${buildQueryString(params)}`),

  // Data reset
  resetData: () => axiosInstance.post('/admin/reset-data'),
}
