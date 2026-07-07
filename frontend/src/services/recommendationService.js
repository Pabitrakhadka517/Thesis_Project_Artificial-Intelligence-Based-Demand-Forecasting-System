import axiosInstance from '@/api/axiosInstance'
import { buildQueryString } from '@/utils'

export const recommendationService = {
  // GET /recommendations?page=&size=&status=&urgency=
  getAllRecommendations: (params = {}) =>
    axiosInstance.get(`/recommendations?${buildQueryString({ page: 1, size: 100, ...params })}`),

  // GET /recommendations/summary
  getSummary: () =>
    axiosInstance.get('/recommendations/summary'),

  // GET /recommendations/urgent?level=immediate,urgent&limit=50
  getUrgent: (level = 'immediate,urgent', limit = 50) =>
    axiosInstance.get(`/recommendations/urgent?level=${encodeURIComponent(level)}&limit=${limit}`),

  // GET /recommendations/{sku_id}
  getRecommendation: (skuId) =>
    axiosInstance.get(`/recommendations/${skuId}`),

  // POST /recommendations/generate/{sku_id}
  generateForSku: (skuId, body = {}) =>
    axiosInstance.post(`/recommendations/generate/${skuId}`, body),

  // POST /recommendations/generate  — empty list = all SKUs
  generateBulk: (skuIds = []) =>
    axiosInstance.post('/recommendations/generate', skuIds),

  // No-ops kept for any legacy callers
  applyRecommendation:   () => Promise.resolve({ data: {} }),
  dismissRecommendation: () => Promise.resolve({ data: {} }),
}
