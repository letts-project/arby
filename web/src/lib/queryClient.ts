import { QueryClient } from '@tanstack/react-query'

/**
 * Server-state cache. Lists/dashboard poll via per-query refetchInterval; a
 * short staleTime dedupes the burst of mounts a route transition makes.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 2_000, refetchOnWindowFocus: false, retry: 1 },
  },
})
