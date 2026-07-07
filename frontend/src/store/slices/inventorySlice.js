import { createSlice } from '@reduxjs/toolkit'

const inventorySlice = createSlice({
  name: 'inventory',
  initialState: {
    filters: {
      search: '',
      category: '',
      status: '',
      page: 1,
      pageSize: 20,
      sortBy: 'name',
      sortOrder: 'asc',
    },
    selectedProduct: null,
  },
  reducers: {
    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload, page: 1 }
    },
    setPage: (state, action) => {
      state.filters.page = action.payload
    },
    setPageSize: (state, action) => {
      state.filters.pageSize = action.payload
      state.filters.page = 1
    },
    setSort: (state, action) => {
      state.filters.sortBy = action.payload.sortBy
      state.filters.sortOrder = action.payload.sortOrder
    },
    resetFilters: (state) => {
      state.filters = {
        search: '',
        category: '',
        status: '',
        page: 1,
        pageSize: 20,
        sortBy: 'name',
        sortOrder: 'asc',
      }
    },
    setSelectedProduct: (state, action) => {
      state.selectedProduct = action.payload
    },
  },
})

export const {
  setFilters,
  setPage,
  setPageSize,
  setSort,
  resetFilters,
  setSelectedProduct,
} = inventorySlice.actions

export const selectInventoryFilters = (state) => state.inventory.filters
export const selectSelectedProduct = (state) => state.inventory.selectedProduct

export default inventorySlice.reducer
