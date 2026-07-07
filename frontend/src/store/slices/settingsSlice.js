import { createSlice } from '@reduxjs/toolkit'

const settingsSlice = createSlice({
  name: 'settings',
  initialState: {
    forecastHorizon: 30,
    defaultModel: 'prophet',
    alertThresholds: { lowStock: 20, criticalStock: 10 },
    notifications: { email: true, inApp: true },
    dashboardLayout: 'default',
    currency: 'NPR',
    dateFormat: 'MMM d, yyyy',
  },
  reducers: {
    updateSettings: (state, action) => {
      return { ...state, ...action.payload }
    },
    updateForecastHorizon: (state, action) => {
      state.forecastHorizon = action.payload
    },
    updateDefaultModel: (state, action) => {
      state.defaultModel = action.payload
    },
    updateAlertThresholds: (state, action) => {
      state.alertThresholds = { ...state.alertThresholds, ...action.payload }
    },
    updateNotifications: (state, action) => {
      state.notifications = { ...state.notifications, ...action.payload }
    },
  },
})

export const {
  updateSettings,
  updateForecastHorizon,
  updateDefaultModel,
  updateAlertThresholds,
  updateNotifications,
} = settingsSlice.actions

export const selectSettings = (state) => state.settings
export const selectForecastHorizon = (state) => state.settings.forecastHorizon
export const selectDefaultModel = (state) => state.settings.defaultModel

export default settingsSlice.reducer
