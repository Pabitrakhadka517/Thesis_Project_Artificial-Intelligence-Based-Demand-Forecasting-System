import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { store, persistor } from '@/store'
import { injectAxiosDispatch } from '@/api/axiosInstance'
import { AppRoutes } from '@/routes'
import { PageLoader } from '@/components/common/PageLoader'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { QUERY_STALE_TIME, QUERY_CACHE_TIME } from '@/constants'

// Wire store.dispatch into axiosInstance so 401s can dispatch forceLogout
// without creating a circular module dependency
injectAxiosDispatch(store.dispatch)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME,
      gcTime: QUERY_CACHE_TIME,
      // Don't retry on 4xx or 503 (AI service offline) — only retry on network errors
      retry: (failureCount, error) => {
        const status = error?.response?.status
        if (status && (status >= 400 && status < 600)) return false
        return failureCount < 1
      },
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <ErrorBoundary>
      <Provider store={store}>
        <PersistGate loading={<PageLoader />} persistor={persistor}>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </QueryClientProvider>
        </PersistGate>
      </Provider>
    </ErrorBoundary>
  )
}
