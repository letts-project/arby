import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import type { MissionsPage } from '@/lib/types'

export interface MissionsFilter {
  status?: string
  outcome?: string
  lane?: string
  mission?: string
  host?: string
  order?: string
  cursor?: string
  limit?: number
}

/** Cursor-paginated mission list, polled every 5s; keeps the prior page during
 *  refetch so pagination doesn't flicker. */
export function useMissions(filter: MissionsFilter) {
  return useQuery({
    queryKey: ['missions', filter],
    queryFn: () => apiGet<MissionsPage>('/api/missions', { ...filter }),
    refetchInterval: 5000,
    placeholderData: keepPreviousData,
  })
}
