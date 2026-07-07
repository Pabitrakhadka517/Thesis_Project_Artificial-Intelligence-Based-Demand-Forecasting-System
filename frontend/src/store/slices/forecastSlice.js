import { createSlice } from '@reduxjs/toolkit'

const forecastSlice = createSlice({
  name: 'forecast',
  initialState: {
    selectedModel: 'prophet',
    selectedHorizon: 'monthly',
    selectedProductId: null,
    dateRange: { start: null, end: null },
  },
  reducers: {
    setSelectedModel: (state, action) => {
      state.selectedModel = action.payload
    },
    setSelectedHorizon: (state, action) => {
      state.selectedHorizon = action.payload
    },
    setSelectedProductId: (state, action) => {
      state.selectedProductId = action.payload
    },
    setDateRange: (state, action) => {
      state.dateRange = action.payload
    },
  },
})

export const {
  setSelectedModel,
  setSelectedHorizon,
  setSelectedProductId,
  setDateRange,
} = forecastSlice.actions

export const selectForecastModel = (state) => state.forecast.selectedModel
export const selectForecastHorizon = (state) => state.forecast.selectedHorizon
export const selectForecastProductId = (state) => state.forecast.selectedProductId

export default forecastSlice.reducer
