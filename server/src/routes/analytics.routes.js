'use strict'
const express = require('express')
const ctrl    = require('../controllers/analytics.controller')
const { protect }         = require('../middleware/auth')
const { managerOrAdmin }  = require('../middleware/authorize')

const router = express.Router()
router.use(protect)
router.use(managerOrAdmin)

// ── Dashboard ──────────────────────────────────────────────────────────────────
router.get('/dashboard/summary',           ctrl.getDashboardSummary)
router.get('/dashboard/revenue-trend',     ctrl.getRevenueTrend)
router.get('/dashboard/revenue-breakdown', ctrl.getRevenueBreakdown)
router.get('/dashboard/top-products',      ctrl.getDashboardTopProducts)
router.get('/dashboard/stock-health',      ctrl.getStockHealth)
router.get('/dashboard/monthly-trend',     ctrl.getMonthlyTrend)
router.get('/dashboard/sales-heatmap',     ctrl.getSalesHeatmap)

// ── Inventory ──────────────────────────────────────────────────────────────────
router.get('/inventory/summary',          ctrl.getInventorySummary)
router.get('/inventory/status-breakdown', ctrl.getInventoryStatusBreakdown)
router.get('/inventory/category-stock',   ctrl.getCategoryStock)
router.get('/inventory/risk-scatter',     ctrl.getRiskScatter)
router.get('/inventory/turnover',         ctrl.getInventoryTurnover)
router.get('/inventory/low-stock',        ctrl.getLowStockItems)

// ── Forecast ───────────────────────────────────────────────────────────────────
router.get('/forecast/accuracy',          ctrl.getForecastAccuracy)
router.get('/forecast/model-coverage',    ctrl.getModelCoverage)
router.get('/forecast/demand-vs-actual',  ctrl.getDemandVsActual)
router.get('/forecast/demand-by-category',ctrl.getDemandByCategory)
router.get('/forecast/demand-heatmap',    ctrl.getDemandHeatmap)

// ── Product ────────────────────────────────────────────────────────────────────
router.get('/product/category-performance', ctrl.getCategoryPerformance)
router.get('/product/velocity',             ctrl.getVelocityRanking)
router.get('/product/period-comparison',    ctrl.getPeriodComparison)
router.get('/product/price-trends',         ctrl.getPriceTrends)
router.get('/product/sku-trend',            ctrl.getSkuTrend)

// ── Advanced ───────────────────────────────────────────────────────────────────
router.get('/advanced/forecast-comparison', ctrl.getAdvancedForecastComparison)
router.get('/advanced/inventory-health',    ctrl.getInventoryHealth)
router.get('/advanced/supplier-performance',ctrl.getSupplierPerformance)
router.get('/advanced/festival-demand',     ctrl.getFestivalDemand)

module.exports = router
