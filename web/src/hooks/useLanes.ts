import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import type { LanesResult } from '@/lib/types'

/** Every lane across the cluster, polled every 4s. */
export function useLanes() {
  return useQuery({
    queryKey: ['lanes'],
    queryFn: () => apiGet<LanesResult>('/api/lanes'),
    refetchInterval: 4000,
  })
}
