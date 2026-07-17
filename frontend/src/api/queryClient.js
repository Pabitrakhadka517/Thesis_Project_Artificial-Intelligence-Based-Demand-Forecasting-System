import { QueryClient } from '@tanstack/react-query'
import { QUERY_STALE_TIME, QUERY_CACHE_TIME } from '@/constants'

// Single shared QueryClient instance — imported by App.jsx (for the provider)
// and by the auth layer (authSlice, axiosInstance) so logout/force-logout can
// clear cached data. Kept in its own module to avoid a circular import between
// App.jsx and the auth layer.
export const queryClient = new QueryClient({
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
