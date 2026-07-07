import axiosInstance from '@/api/axiosInstance'

const BASE = '/ai'

export const chatService = {
  sendMessage:    (message)        => axiosInstance.post(`${BASE}/chat`,        { message }),
  getSuggestions: ()               => axiosInstance.get(`${BASE}/suggestions`),
  getInsights:    ()               => axiosInstance.get(`${BASE}/insights`),
  getHistory:     (limit = 50)     => axiosInstance.get(`${BASE}/history`, { params: { limit } }),
  clearHistory:   ()               => axiosInstance.delete(`${BASE}/history`),
}
