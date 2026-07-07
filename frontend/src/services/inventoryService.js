import axiosInstance from '@/api/axiosInstance'
import { buildQueryString } from '@/utils'

export const inventoryService = {
  // GET /inventory/enriched — joined inventory + SKU + recommendations
  getProducts: (params = {}) => {
    const {
      page = 1, pageSize: size = 20, search = '',
      category = '', status = '',
      sortBy: sort_by = 'name', sortOrder: sort_order = 'asc',
    } = params
    return axiosInstance.get(
      `/inventory/enriched?${buildQueryString({ page, size, search, category, status, sort_by, sort_order })}`
    )
  },

  // GET /inventory — raw rows (paginated)
  getInventoryRaw: (params = {}) =>
    axiosInstance.get(`/inventory?${buildQueryString(params)}`),

  // GET /skus/{sku_id} — single product detail
  getProduct: (skuId) => axiosInstance.get(`/skus/${skuId}`),

  // GET /products/categories — distinct categories (replaces legacy /skus/categories)
  getCategories: () => axiosInstance.get('/products/categories'),

  // Filtered helpers
  getLowStockProducts: () =>
    axiosInstance.get('/inventory/enriched?status=low&size=100'),
  getCriticalStockProducts: () =>
    axiosInstance.get('/inventory/enriched?status=critical&size=100'),
  getOverstockProducts: () =>
    axiosInstance.get('/inventory/enriched?status=overstock&size=100'),

  // GET /skus — list all SKUs (dropdowns)
  getAllSKUs: (params = {}) =>
    axiosInstance.get(`/skus?${buildQueryString(params)}`),

  // PATCH /inventory/{sku_id}/stock — absolute set
  setStock: (skuId, currentStock) =>
    axiosInstance.patch(`/inventory/${skuId}/stock?current_stock=${currentStock}`),

  // Client-side CSV export
  exportInventory: async (_format = 'csv') => {
    const { data } = await inventoryService.getProducts({ pageSize: 500 })
    const rows = data?.items || []
    if (rows.length === 0) throw new Error('No inventory data to export')
    const cols = ['sku_id', 'name', 'category', 'current_stock', 'safety_stock', 'reorder_point', 'stock_status']
    const headers = cols.join(',')
    const body = rows.map(row =>
      cols.map(c => `"${String(row[c] ?? '').replace(/"/g, '""')}"`).join(',')
    )
    const csv = [headers, ...body].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    return { data: blob }
  },

  getStockMovement: () => Promise.resolve({ data: { movements: [] } }),
}
