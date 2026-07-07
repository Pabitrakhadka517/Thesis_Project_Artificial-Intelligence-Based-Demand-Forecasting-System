import axiosInstance from '@/api/axiosInstance'
import { buildQueryString } from '@/utils'

export const forecastService = {
  // ── Legacy prophet-based forecasts (GET /forecasts) ──────────────────────
  getProductForecast: (skuId, params = {}) => {
    const days = params.days || 30
    return axiosInstance.get(`/prophet/predict/${skuId}?horizon=${days}`)
  },

  getForecast: (params = {}) =>
    axiosInstance.get(`/forecasting?${buildQueryString(params)}`),

  // ── Prophet ───────────────────────────────────────────────────────────────
  prophet: {
    // GET /prophet/models — list all trained prophet models
    listModels: (params = {}) =>
      axiosInstance.get(`/prophet/models?${buildQueryString(params)}`),

    // GET /prophet/models/{sku_id}
    getModel: (skuId) =>
      axiosInstance.get(`/prophet/models/${skuId}`),

    // POST /prophet/train/{sku_id}
    train: (skuId, body = {}) =>
      axiosInstance.post(`/prophet/train/${skuId}`, body),

    // POST /prophet/train/{sku_id}/background
    trainBackground: (skuId, body = {}) =>
      axiosInstance.post(`/prophet/train/${skuId}/background`, body),

    // GET /prophet/predict/{sku_id}?horizon=
    predict: (skuId, horizon = 30) =>
      axiosInstance.get(`/prophet/predict/${skuId}?horizon=${horizon}`),

    // GET /prophet/predict/{sku_id}/week
    predictWeek: (skuId) =>
      axiosInstance.get(`/prophet/predict/${skuId}/week`),

    // GET /prophet/predict/{sku_id}/month
    predictMonth: (skuId) =>
      axiosInstance.get(`/prophet/predict/${skuId}/month`),

    // GET /prophet/forecasts/{sku_id}
    getForecasts: (skuId) =>
      axiosInstance.get(`/prophet/forecasts/${skuId}`),

    // DELETE /prophet/models/{sku_id}
    deleteModel: (skuId) =>
      axiosInstance.delete(`/prophet/models/${skuId}`),
  },

  // ── Random Forest ─────────────────────────────────────────────────────────
  rf: {
    listModels: (params = {}) =>
      axiosInstance.get(`/rf/models?${buildQueryString(params)}`),

    getModel: (skuId) =>
      axiosInstance.get(`/rf/models/${skuId}`),

    train: (skuId, body = {}) =>
      axiosInstance.post(`/rf/train/${skuId}`, body),

    trainBackground: (skuId, body = {}) =>
      axiosInstance.post(`/rf/train/${skuId}/background`, body),

    predict: (skuId, horizon = 30) =>
      axiosInstance.get(`/rf/predict/${skuId}?horizon=${horizon}`),

    predictWeek: (skuId) =>
      axiosInstance.get(`/rf/predict/${skuId}/week`),

    predictMonth: (skuId) =>
      axiosInstance.get(`/rf/predict/${skuId}/month`),

    getForecasts: (skuId) =>
      axiosInstance.get(`/rf/forecasts/${skuId}`),

    deleteModel: (skuId) =>
      axiosInstance.delete(`/rf/models/${skuId}`),
  },

  // ── LSTM ──────────────────────────────────────────────────────────────────
  lstm: {
    listModels: (params = {}) =>
      axiosInstance.get(`/lstm/models?${buildQueryString(params)}`),

    getModel: (skuId) =>
      axiosInstance.get(`/lstm/models/${skuId}`),

    train: (skuId, body = {}) =>
      axiosInstance.post(`/lstm/train/${skuId}`, body),

    trainBackground: (skuId, body = {}) =>
      axiosInstance.post(`/lstm/train/${skuId}/background`, body),

    predict: (skuId, horizon = 30) =>
      axiosInstance.get(`/lstm/predict/${skuId}?horizon=${horizon}`),

    predictWeek: (skuId) =>
      axiosInstance.get(`/lstm/predict/${skuId}/week`),

    predictMonth: (skuId) =>
      axiosInstance.get(`/lstm/predict/${skuId}/month`),

    getForecasts: (skuId) =>
      axiosInstance.get(`/lstm/forecasts/${skuId}`),

    deleteModel: (skuId) =>
      axiosInstance.delete(`/lstm/models/${skuId}`),
  },

  // ── Optimization ─────────────────────────────────────────────────────────
  optimize: (skuId, body = {}) =>
    axiosInstance.post(`/optimization/${skuId}`, body),

  optimizeBulk: (body) =>
    axiosInstance.post('/optimization/bulk', body),

  optimizeAll: (body = {}) =>
    axiosInstance.post('/optimization/bulk-all', body),

  // ── Retrain trigger (admin) ───────────────────────────────────────────────
  runForecast: (data) =>
    axiosInstance.post('/models/retrain', { sku_id: data.product_id || data.sku_id }),

  getModelMetrics: () =>
    axiosInstance.get('/models/summary').catch(() => ({ data: {} })),

  // ── Revenue forecast (dashboard) ─────────────────────────────────────────
  getRevenueForecast: () =>
    axiosInstance.get('/dashboard/revenue-forecast'),
}
