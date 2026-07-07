import { createSlice } from '@reduxjs/toolkit'

const alertSlice = createSlice({
  name: 'alert',
  initialState: {
    filters: { type: '', priority: '', status: 'active', page: 1, pageSize: 20 },
    unreadCount: 0,
  },
  reducers: {
    setAlertFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload, page: 1 }
    },
    setAlertPage: (state, action) => {
      state.filters.page = action.payload
    },
    setUnreadCount: (state, action) => {
      state.unreadCount = action.payload
    },
    decrementUnreadCount: (state) => {
      if (state.unreadCount > 0) state.unreadCount -= 1
    },
  },
})

export const { setAlertFilters, setAlertPage, setUnreadCount, decrementUnreadCount } =
  alertSlice.actions

export const selectAlertFilters = (state) => state.alert.filters
export const selectUnreadCount = (state) => state.alert.unreadCount

export default alertSlice.reducer
