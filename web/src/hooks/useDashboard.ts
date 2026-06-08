import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import type { DashboardResult } from '@/lib/types'

/** Cluster overview, polled every 4s. */
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiGet<DashboardResult>('/api/dashboard'),
    refetchInterval: 4000,
  })
}
