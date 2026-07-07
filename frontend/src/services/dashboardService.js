import axiosInstance from '@/api/axiosInstance'

export const dashboardService = {
  getSummary:              ()          => axiosInstance.get('/dashboard/summary'),
  getSalesTrend:           (days = 7)  => axiosInstance.get(`/dashboard/sales-trend?days=${days}`),
  getCategoryDistribution: ()          => axiosInstance.get('/dashboard/category-distribution'),
  getRecentTransactions:   (limit = 10) => axiosInstance.get(`/dashboard/recent-transactions?limit=${limit}`),
  getRecommendations:      ()          => axiosInstance.get('/dashboard/recommendations'),
  // Legacy aliases
  getKPIs:                 ()          => axiosInstance.get('/dashboard/summary'),
  getRecentAlerts:         (limit = 5) => axiosInstance.get(`/alerts?limit=${limit}`),
}
