import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import type { MergedMission } from '@/lib/types'

/** One mission record (header fields). Live progress/output come from the SSE
 *  hooks, so this is not polled. */
export function useMission(host: string, id: string) {
  return useQuery({
    queryKey: ['mission', host, id],
    queryFn: () => apiGet<MergedMission>(`/api/missions/${encodeURIComponent(host)}/${encodeURIComponent(id)}`),
    // Poll while running so the header transitions to its terminal state; stop
    // once done (live progress/output come from the SSE hooks).
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 3000 : false),
  })
}
