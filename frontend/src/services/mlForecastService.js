/**
 * ML Forecast Service
 * Calls /api/v1/ml/* which the Node.js proxy forwards to FastAPI /api/ai/ml/*
 */
import axiosInstance from '@/api/axiosInstance'

const BASE = '/ml'

export const mlForecastService = {
  // ── SKU catalogue ──────────────────────────────────────────────────────────
  /** List all 50 dataset SKUs with metadata */
  listSkus: () =>
    axiosInstance.get(`${BASE}/skus`),

  /** Summary statistics of the CSV training dataset */
  datasetSummary: () =>
    axiosInstance.get(`${BASE}/dataset/summary`),

  // ── Training ───────────────────────────────────────────────────────────────
  /** Train RF + XGBoost + LSTM for one SKU (synchronous, ~2-5 min) */
  trainSku: (skuId) =>
    axiosInstance.post(`${BASE}/train/${skuId}`, {}, { timeout: 600000 }),

  /** Queue training for all (or listed) SKUs in background */
  trainAll: (skuIds = null) =>
    axiosInstance.post(`${BASE}/train`, { sku_ids: skuIds }, { timeout: 600000 }),

  // ── Model info ─────────────────────────────────────────────────────────────
  /** List all trained model metadata (one entry per trained SKU) */
  listModels: () =>
    axiosInstance.get(`${BASE}/models`),

  /** Metadata for a specific SKU */
  getModel: (skuId) =>
    axiosInstance.get(`${BASE}/models/${skuId}`),

  /** Side-by-side RF / XGBoost / LSTM metrics for one SKU */
  compareModels: (skuId) =>
    axiosInstance.get(`${BASE}/compare/${skuId}`),

  // ── Forecasting ────────────────────────────────────────────────────────────
  /**
   * Run demand forecast for one SKU.
   * Also computes and stores full inventory recommendations.
   * @param {string} skuId
   * @param {number} horizonDays
   * @param {string|null} model  'random_forest' | 'xgboost' | 'lstm' | null (auto best)
   */
  runForecast: (skuId, horizonDays = 30, model = null) =>
    axiosInstance.post(`${BASE}/forecast/${skuId}`, {
      horizon_days: horizonDays,
      ...(model ? { model } : {}),
    }),

  /** Return the cached forecast from MongoDB without re-running */
  getStoredForecast: (skuId, model = null) => {
    const q = model ? `?model=${model}` : ''
    return axiosInstance.get(`${BASE}/forecast/${skuId}/stored${q}`)
  },

  /** List all cached forecasts */
  listForecasts: (limit = 50) =>
    axiosInstance.get(`${BASE}/forecasts?limit=${limit}`),

  // ── Inventory recommendations ──────────────────────────────────────────────
  /**
   * All inventory recommendations, optionally filtered by risk level.
   * @param {'high'|'medium'|'low'|null} risk
   */
  listInventoryRecs: (risk = null) => {
    const q = risk ? `?risk=${risk}` : ''
    return axiosInstance.get(`${BASE}/inventory${q}`)
  },

  /** Inventory recommendation for one SKU */
  getInventoryRec: (skuId) =>
    axiosInstance.get(`${BASE}/inventory/${skuId}`),

  /** All SKUs whose current stock is at or below the reorder point */
  reorderAlerts: () =>
    axiosInstance.get(`${BASE}/reorder-alerts`),

  /** Generate LLM-powered business insights from current inventory data */
  generateInsights: () =>
    axiosInstance.post(`${BASE}/insights`, {}),
}
