// Canonical color/label maps for stock status, alert priority, and risk level.
// Single source of truth — previously redefined independently (with drifting
// hex values) across utils/index.js, constants/index.js, Badge.jsx, and
// per-page RISK/RISK_STYLE/STATUS_COLORS maps. Every page should import from
// here instead of hand-rolling its own copy.
//
// `color`/`tint`/`tintBorder` reference the CSS custom properties in
// index.css so light/dark theming stays centralized in one place.

export const STOCK_STATUS_STYLES = {
  healthy: {
    label: 'Healthy',
    color: 'var(--color-success)',
    tint: 'var(--tint-success)',
    tintBorder: 'var(--tint-success-border)',
  },
  low: {
    label: 'Low Stock',
    color: 'var(--brand-amber)',
    tint: 'var(--tint-warning)',
    tintBorder: 'var(--tint-warning-border)',
  },
  critical: {
    label: 'Critical',
    color: 'var(--color-danger)',
    tint: 'var(--tint-danger)',
    tintBorder: 'var(--tint-danger-border)',
  },
  overstock: {
    label: 'Overstock',
    color: 'var(--brand-indigo)',
    tint: 'rgba(99,102,241,.1)',
    tintBorder: 'rgba(99,102,241,.2)',
  },
  out_of_stock: {
    label: 'Out of Stock',
    color: '#991B1B',
    tint: 'rgba(153,27,27,.1)',
    tintBorder: 'rgba(153,27,27,.2)',
  },
}

export const ALERT_PRIORITY_STYLES = {
  low: {
    label: 'Low',
    color: 'var(--color-info)',
    tint: 'var(--tint-info)',
    tintBorder: 'var(--tint-info-border)',
  },
  medium: {
    label: 'Medium',
    color: 'var(--brand-amber)',
    tint: 'var(--tint-warning)',
    tintBorder: 'var(--tint-warning-border)',
  },
  high: {
    label: 'High',
    color: '#C2410C',
    tint: 'rgba(194,65,12,.1)',
    tintBorder: 'rgba(194,65,12,.2)',
  },
  critical: {
    label: 'Critical',
    color: 'var(--color-danger)',
    tint: 'var(--tint-danger)',
    tintBorder: 'var(--tint-danger-border)',
  },
}

export const RISK_STYLES = {
  low: {
    label: 'Low Risk',
    color: 'var(--color-success)',
    tint: 'var(--tint-success)',
    tintBorder: 'var(--tint-success-border)',
  },
  medium: {
    label: 'Medium Risk',
    color: 'var(--brand-amber)',
    tint: 'var(--tint-warning)',
    tintBorder: 'var(--tint-warning-border)',
  },
  high: {
    label: 'High Risk',
    color: 'var(--color-danger)',
    tint: 'var(--tint-danger)',
    tintBorder: 'var(--tint-danger-border)',
  },
}

// Ordered categorical palette for chart series (pie/bar/line). One shared list
// so "series #3" reads as the same hue on every chart in the app. Plain hex
// (not var()) since these feed SVG fill/stroke props in recharts — values are
// kept numerically in sync with the --brand-* tokens in index.css.
export const CHART_PALETTE = [
  '#2563EB', // brand-blue
  '#16A34A', // color-success
  '#F59E0B', // brand-amber
  '#8B5CF6', // brand-purple
  '#06B6D4', // brand-cyan
  '#6366F1', // brand-indigo
  '#14B8A6', // brand-teal
  '#DC2626', // color-danger
]
