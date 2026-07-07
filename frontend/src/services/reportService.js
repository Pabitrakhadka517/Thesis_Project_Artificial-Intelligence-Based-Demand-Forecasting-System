import axiosInstance from '@/api/axiosInstance'
import { buildQueryString } from '@/utils'

const qs = (p = {}) =>
  buildQueryString(Object.fromEntries(Object.entries(p).filter(([, v]) => v != null && v !== '')))

export const reportService = {
  getExecutiveReport:      (p) => axiosInstance.get(`/reports/executive?${qs(p)}`),
  getSalesReport:          (p) => axiosInstance.get(`/reports/sales?${qs(p)}`),
  getPurchaseReport:       (p) => axiosInstance.get(`/reports/purchases?${qs(p)}`),
  getInventoryReport:      (p) => axiosInstance.get(`/reports/inventory?${qs(p)}`),
  getSupplierReport:       (p) => axiosInstance.get(`/reports/suppliers?${qs(p)}`),
  getProfitReport:         (p) => axiosInstance.get(`/reports/profit?${qs(p)}`),
  getForecastReport:       (p) => axiosInstance.get(`/reports/forecast?${qs(p)}`),
  getLowStockReport:       (p) => axiosInstance.get(`/reports/low-stock?${qs(p)}`),
  getInventoryAgingReport: (p) => axiosInstance.get(`/reports/inventory-aging?${qs(p)}`),
}
