import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import { useInteractionLocked } from '@/lib/interactionLock'
import type { DashboardResult } from '@/lib/types'

/** Cluster overview, polled every 4s unless the user is mid-interaction. */
export function useDashboard() {
  const paused = useInteractionLocked()
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiGet<DashboardResult>('/api/dashboard'),
    refetchInterval: paused ? false : 4000,
  })
}
