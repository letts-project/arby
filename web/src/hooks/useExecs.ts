import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import type { MissionsPage } from '@/lib/types'

export interface ExecFilter {
  status?: string
  outcome?: string
  group_id?: string
  host?: string
  order?: string
  cursor?: string
  limit?: number
}

/** Cursor-paginated exec history (kind=exec), polled every 5s. */
export function useExecs(filter: ExecFilter) {
  return useQuery({
    queryKey: ['execs', filter],
    queryFn: () => apiGet<MissionsPage>('/api/exec', { ...filter }),
    refetchInterval: 5000,
    placeholderData: keepPreviousData,
  })
}
