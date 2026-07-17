import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { store, persistor } from '@/store'
import { injectAxiosDispatch } from '@/api/axiosInstance'
import { queryClient } from '@/api/queryClient'
import { AppRoutes } from '@/routes'
import { PageLoader } from '@/components/common/PageLoader'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { useTheme } from '@/hooks/useTheme'

// Applies the persisted light/dark theme class to <html> on every route —
// Navbar (dashboard-only) also calls useTheme for its toggle button, but
// public routes like "/" render no Navbar and would otherwise never sync.
function ThemeSync() {
  useTheme()
  return null
}

// Wire store.dispatch into axiosInstance so 401s can dispatch forceLogout
// without creating a circular module dependency
injectAxiosDispatch(store.dispatch)

export default function App() {
  return (
    <ErrorBoundary>
      <Provider store={store}>
        <PersistGate loading={<PageLoader />} persistor={persistor}>
          <QueryClientProvider client={queryClient}>
            <ThemeSync />
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </QueryClientProvider>
        </PersistGate>
      </Provider>
    </ErrorBoundary>
  )
}
