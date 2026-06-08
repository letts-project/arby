import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import type { ExecDetail } from '@/lib/types'

/** One exec record plus its script preview. Polls while running (mirrors useMission). */
export function useExec(host: string, id: string) {
  return useQuery({
    queryKey: ['exec', host, id],
    queryFn: () => apiGet<ExecDetail>(`/api/exec/${encodeURIComponent(host)}/${encodeURIComponent(id)}`),
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 3000 : false),
  })
}
