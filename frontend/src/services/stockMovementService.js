import axiosInstance from '@/api/axiosInstance'
import { buildQueryString } from '@/utils'

export const stockMovementService = {
  // GET /stock-movements/summary
  getSummary: () =>
    axiosInstance.get('/stock-movements/summary'),

  // GET /stock-movements
  getMovements: (params = {}) => {
    const {
      page = 1,
      size = 20,
      sku_id,
      movement_type,
      performed_by,
    } = params
    return axiosInstance.get(
      `/stock-movements?${buildQueryString({ page, size, sku_id, movement_type, performed_by })}`
    )
  },
}
