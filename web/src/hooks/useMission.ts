import { useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import type { DashboardResult, MergedMission, MissionsPage } from '@/lib/types'

/** cachedListRow finds the mission in any list already in the cache, so the
 *  detail page can render at once while its own record loads. */
export function cachedListRow(qc: QueryClient, host: string, id: string): MergedMission | undefined {
  const match = (m: MergedMission) => m.host === host && m.mission_id === id
  for (const key of [['missions'], ['execs'], ['execGroup']]) {
    for (const [, data] of qc.getQueriesData<MissionsPage | InfiniteData<MissionsPage>>({ queryKey: key })) {
      const pages = data && 'pages' in data ? data.pages : [data]
      for (const page of pages) {
        const hit = page?.items?.find(match)
        if (hit) return hit
      }
    }
  }
  return qc.getQueryData<DashboardResult>(['dashboard'])?.recent_failures?.find(match)
}

/** One mission record. Polled until it finishes so the header follows it;
 *  live progress and output come from the SSE hooks. */
export function useMission(host: string, id: string) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['mission', host, id],
    queryFn: () => apiGet<MergedMission>(`/api/missions/${encodeURIComponent(host)}/${encodeURIComponent(id)}`),
    placeholderData: () => cachedListRow(qc, host, id),
    refetchInterval: (q) => (q.state.data?.status === 'running' || q.state.data?.status === 'queued' ? 3000 : false),
  })
}
