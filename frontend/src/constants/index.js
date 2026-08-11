export const APP_NAME = 'StockWise'
// In development, leave empty so requests use the Vite proxy (/api → localhost:8000)
// and stay same-origin — no CORS needed. In production set VITE_API_URL to the real backend.
export const API_BASE_URL = import.meta.env.VITE_API_URL || ''

export const TOKEN_KEY = 'stockwise_access_token'
export const REFRESH_TOKEN_KEY = 'stockwise_refresh_token'

export const STOCK_STATUS = {
  HEALTHY: 'healthy',
  LOW: 'low',
  CRITICAL: 'critical',
  OVERSTOCK: 'overstock',
  OUT_OF_STOCK: 'out_of_stock',
}

export const STOCK_STATUS_COLORS = {
  healthy:     { color: '#16A34A', background: 'rgba(22,163,74,.12)'  },
  low:         { color: '#EA580C', background: 'rgba(234,88,12,.12)'  },
  critical:    { color: '#DC2626', background: 'rgba(220,38,38,.12)'  },
  overstock:   { color: '#2563EB', background: 'rgba(37,99,235,.12)'  },
  out_of_stock:{ color: '#64748B', background: 'rgba(100,116,139,.12)'},
}

export const ALERT_PRIORITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
}

export const ALERT_PRIORITY_COLORS = {
  low: 'text-blue-600 bg-blue-50',
  medium: 'text-yellow-600 bg-yellow-50',
  high: 'text-orange-600 bg-orange-50',
  critical: 'text-red-600 bg-red-50',
}

export const FORECAST_MODELS = [
  { value: 'arima', label: 'ARIMA' },
  { value: 'sarima', label: 'SARIMA' },
  { value: 'prophet', label: 'Prophet' },
  { value: 'random_forest', label: 'Random Forest' },
  { value: 'gradient_boosting', label: 'Gradient Boosting' },
  { value: 'lstm', label: 'LSTM' },
]

export const FORECAST_HORIZONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
]

// Values kept numerically identical to CHART_PALETTE (constants/statusColors.js)
// so a chart's default series colors match every other chart in the app —
// previously drifted (#3b82f6 vs #2563EB etc.), which made e.g. "primary blue"
// render as two visibly different shades depending on which chart you looked at.
export const CHART_COLORS = {
  primary: '#2563EB',
  success: '#16A34A',
  warning: '#F59E0B',
  purple:  '#8B5CF6',
  info:    '#06B6D4',
  indigo:  '#6366F1',
  teal:    '#14B8A6',
  danger:  '#DC2626',
}

export const PAGINATION_PAGE_SIZES = [10, 20, 50, 100]

// Shared Framer Motion timings — reuse instead of picking a one-off duration
// per component so overlays/transitions read as one consistent system.
export const MOTION = {
  fast: 0.12,
  base: 0.2,
  slow: 0.32,
  ease: [0.4, 0, 0.2, 1],
}

export const QUERY_STALE_TIME = 5 * 60 * 1000 // 5 min
export const QUERY_CACHE_TIME = 10 * 60 * 1000 // 10 min
