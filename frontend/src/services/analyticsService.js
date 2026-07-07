import axiosInstance from '@/api/axiosInstance'

// Base: /analytics/dashboard, /analytics/inventory, /analytics/forecast, /analytics/product

export const analyticsService = {
  // ── Dashboard ──────────────────────────────────────────────────────────────
  getDashboardSummary: () =>
    axiosInstance.get('/analytics/dashboard/summary'),

  getRevenueTrend: (days = 30) =>
    axiosInstance.get(`/analytics/dashboard/revenue-trend?days=${days}`),

  getRevenueBreakdown: (days = 30) =>
    axiosInstance.get(`/analytics/dashboard/revenue-breakdown?days=${days}`),

  getDashboardTopProducts: (limit = 10, by = 'revenue', days = 30) =>
    axiosInstance.get(`/analytics/dashboard/top-products?limit=${limit}&by=${by}&days=${days}`),

  getStockHealth: () =>
    axiosInstance.get('/analytics/dashboard/stock-health'),

  getSalesHeatmap: (days = 90) =>
    axiosInstance.get(`/analytics/dashboard/sales-heatmap?days=${days}`),

  getMonthlyTrend: (months = 12) =>
    axiosInstance.get(`/analytics/dashboard/monthly-trend?months=${months}`),

  // ── Inventory ─────────────────────────────────────────────────────────────
  getInventorySummary: () =>
    axiosInstance.get('/analytics/inventory/summary'),

  getInventoryStatusBreakdown: () =>
    axiosInstance.get('/analytics/inventory/status-breakdown'),

  getCategoryStock: () =>
    axiosInstance.get('/analytics/inventory/category-stock'),

  getRiskScatter: (limit = 200) =>
    axiosInstance.get(`/analytics/inventory/risk-scatter?limit=${limit}`),

  getInventoryTurnover: (days = 90) =>
    axiosInstance.get(`/analytics/inventory/turnover?days=${days}`),

  getLowStockItems: (limit = 30) =>
    axiosInstance.get(`/analytics/inventory/low-stock?limit=${limit}`),

  // ── Forecast ──────────────────────────────────────────────────────────────
  getForecastAccuracy: () =>
    axiosInstance.get('/analytics/forecast/accuracy'),

  getModelCoverage: () =>
    axiosInstance.get('/analytics/forecast/model-coverage'),

  getDemandVsActual: (skuId, days = 30) =>
    axiosInstance.get(`/analytics/forecast/demand-vs-actual?sku_id=${skuId}&days=${days}`),

  getDemandByCategory: (days = 30) =>
    axiosInstance.get(`/analytics/forecast/demand-by-category?days=${days}`),

  getDemandHeatmap: (days = 90) =>
    axiosInstance.get(`/analytics/forecast/demand-heatmap?days=${days}`),

  // ── Product ───────────────────────────────────────────────────────────────
  getCategoryPerformance: (days = 30) =>
    axiosInstance.get(`/analytics/product/category-performance?days=${days}`),

  getVelocityRanking: (limit = 20, days = 30) =>
    axiosInstance.get(`/analytics/product/velocity?limit=${limit}&days=${days}`),

  getPeriodComparison: (days = 30) =>
    axiosInstance.get(`/analytics/product/period-comparison?days=${days}`),

  getPriceTrends: (days = 90) =>
    axiosInstance.get(`/analytics/product/price-trends?days=${days}`),

  getSkuTrend: (skuId, days = 90) =>
    axiosInstance.get(`/analytics/product/sku-trend?sku_id=${skuId}&days=${days}`),

  // ── Advanced analytics ────────────────────────────────────────────────────
  getAdvancedForecastComparison: (days = 30) =>
    axiosInstance.get(`/analytics/advanced/forecast-comparison?days=${days}`),

  getInventoryHealth: () =>
    axiosInstance.get('/analytics/advanced/inventory-health'),

  getSupplierPerformance: () =>
    axiosInstance.get('/analytics/advanced/supplier-performance'),

  getFestivalDemand: (days = 730) =>
    axiosInstance.get(`/analytics/advanced/festival-demand?days=${days}`),
}
