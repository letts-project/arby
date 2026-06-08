import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import type { HostsResult } from '@/lib/types'

/** All configured hosts from letts.yaml (no fan-out). Static per arby process,
 *  so it is fetched once and never refetched — used for filter dropdowns,
 *  which need the full host set rather than whatever the current page shows. */
export function useHosts() {
  return useQuery({
    queryKey: ['hosts'],
    queryFn: () => apiGet<HostsResult>('/api/hosts'),
    staleTime: Infinity,
  })
}
