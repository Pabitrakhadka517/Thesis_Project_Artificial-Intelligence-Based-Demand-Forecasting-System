import { createSlice } from '@reduxjs/toolkit'

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    theme: 'light',
    sidebarCollapsed: false,
    sidebarMobileOpen: false,
    notifications: [],
  },
  reducers: {
    toggleTheme: (state) => {
      state.theme = state.theme === 'light' ? 'dark' : 'light'
    },
    setTheme: (state, action) => {
      state.theme = action.payload
    },
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed
    },
    setSidebarCollapsed: (state, action) => {
      state.sidebarCollapsed = action.payload
    },
    toggleMobileSidebar: (state) => {
      state.sidebarMobileOpen = !state.sidebarMobileOpen
    },
    closeMobileSidebar: (state) => {
      state.sidebarMobileOpen = false
    },
    addNotification: (state, action) => {
      state.notifications.push({
        id: Date.now(),
        ...action.payload,
      })
    },
    removeNotification: (state, action) => {
      state.notifications = state.notifications.filter(
        (n) => n.id !== action.payload
      )
    },
  },
})

export const {
  toggleTheme,
  setTheme,
  toggleSidebar,
  setSidebarCollapsed,
  toggleMobileSidebar,
  closeMobileSidebar,
  addNotification,
  removeNotification,
} = uiSlice.actions

export const selectTheme = (state) => state.ui.theme
export const selectSidebarCollapsed = (state) => state.ui.sidebarCollapsed
export const selectSidebarMobileOpen = (state) => state.ui.sidebarMobileOpen
export const selectNotifications = (state) => state.ui.notifications

export default uiSlice.reducer
