import axiosInstance from '@/api/axiosInstance'

const BASE = '/ai'

export const aiService = {
  getHealth:    ()   => axiosInstance.get(`${BASE}/health`),
  getStatus:    ()   => axiosInstance.get(`${BASE}/status`),
  getDashboard: ()   => axiosInstance.get(`${BASE}/dashboard`),

  getAllPredictions: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString()
    return axiosInstance.get(`${BASE}/predictions${qs ? '?' + qs : ''}`)
  },

  getProductPrediction:    (productId) => axiosInstance.get(`${BASE}/predictions/${productId}`),
  refreshProductPrediction:(productId) => axiosInstance.post(`${BASE}/predictions/${productId}/refresh`),
  refreshAll:               ()         => axiosInstance.post(`${BASE}/predictions/refresh-all`),
  clearPrediction:          (productId)=> axiosInstance.delete(`${BASE}/predictions/${productId}`),
}
