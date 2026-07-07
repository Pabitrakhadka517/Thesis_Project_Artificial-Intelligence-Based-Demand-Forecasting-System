const mongoose = require('mongoose')

const forecastPointSchema = new mongoose.Schema({
  // Date stored as proper Date type for range queries and charting
  date:   { type: Date },
  demand: Number,
  lower:  Number,
  upper:  Number,
}, { _id: false })

const predictionSchema = new mongoose.Schema(
  {
    // One prediction document per product; upserted on each AI run
    product:     { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, unique: true },
    sku:         { type: String, maxlength: [100, 'SKU too long'] },
    productName: { type: String, maxlength: [300, 'Product name too long'] },

    // ── Forecast ──────────────────────────────────────────────────────────────
    forecastDemand: Number,
    dailyDemand:    Number,
    demandTrend:    { type: String, enum: ['rising', 'stable', 'falling'], default: 'stable' },

    // ── Inventory levels ──────────────────────────────────────────────────────
    currentStock:      { type: Number, min: 0 },
    safetyStock:       { type: Number, min: 0 },
    reorderPoint:      { type: Number, min: 0 },
    eoq:               { type: Number, min: 0 },
    suggestedPurchase: { type: Number, min: 0 },
    daysOfStock:       { type: Number, min: 0 },
    leadTimeDays:      { type: Number, min: 0 },
    buyingPrice:       { type: Number, min: 0 },

    // ── Risk metrics ──────────────────────────────────────────────────────────
    confidenceScore:      { type: Number, min: 0, max: 100 },
    inventoryRisk:        { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
    stockoutProbability:  { type: Number, min: 0, max: 100 },
    overstockProbability: { type: Number, min: 0, max: 100 },

    // ── Context ───────────────────────────────────────────────────────────────
    explanation:   { type: String, maxlength: [2000, 'Explanation too long'] },
    // Date stored as Date (was String) — enables range queries like "predictions older than 24h"
    predictionDate: { type: Date },
    forecastData:   [forecastPointSchema],
    metrics:        { mape: Number, rmse: Number },
    hasHistoricalData: { type: Boolean, default: false },
    horizonDays:    { type: Number, default: 30, min: 1 },

    // ── Cache control ─────────────────────────────────────────────────────────
    status:     { type: String, enum: ['pending', 'ready', 'failed'], default: 'pending' },
    error:      { type: String, maxlength: [500, 'Error message too long'] },
    analyzedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

// ── Indexes ────────────────────────────────────────────────────────────────────

// Dashboard: "show high-risk ready predictions" — the primary forecasting view
predictionSchema.index({ status: 1, inventoryRisk: 1 })

// "Products with the most urgent purchase need"
predictionSchema.index({ suggestedPurchase: -1 })

// Stale prediction detection: "predictions not refreshed in N hours"
predictionSchema.index({ analyzedAt: 1 })

module.exports = mongoose.model('Prediction', predictionSchema)
