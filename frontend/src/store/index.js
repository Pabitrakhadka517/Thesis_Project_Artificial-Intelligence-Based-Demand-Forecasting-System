import { configureStore, combineReducers } from '@reduxjs/toolkit'
import { persistStore, persistReducer, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist'

// Inline localStorage adapter — avoids CJS/ESM interop issues with redux-persist's built-in storage
const storage = {
  getItem: (key) => Promise.resolve(window.localStorage.getItem(key)),
  setItem: (key, value) => Promise.resolve(window.localStorage.setItem(key, value)),
  removeItem: (key) => Promise.resolve(window.localStorage.removeItem(key)),
}

import authReducer from './slices/authSlice'
import uiReducer from './slices/uiSlice'
import inventoryReducer from './slices/inventorySlice'
import forecastReducer from './slices/forecastSlice'
import alertReducer from './slices/alertSlice'
import settingsReducer from './slices/settingsSlice'

const rootReducer = combineReducers({
  auth: authReducer,
  ui: uiReducer,
  inventory: inventoryReducer,
  forecast: forecastReducer,
  alert: alertReducer,
  settings: settingsReducer,
})

const persistConfig = {
  key: 'stockwise',
  storage,
  whitelist: ['auth', 'ui', 'settings'],
}

const persistedReducer = persistReducer(persistConfig, rootReducer)

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
  devTools: import.meta.env.DEV,
})

export const persistor = persistStore(store)
