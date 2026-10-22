import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import { cachedListRow } from './useMission'
import type { ExecDetail } from '@/lib/types'

/** One exec record plus its script preview. Polls until it finishes (mirrors useMission). */
export function useExec(host: string, id: string) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['exec', host, id],
    queryFn: () => apiGet<ExecDetail>(`/api/exec/${encodeURIComponent(host)}/${encodeURIComponent(id)}`),
    placeholderData: () => cachedListRow(qc, host, id),
    refetchInterval: (q) => (q.state.data?.status === 'running' || q.state.data?.status === 'queued' ? 3000 : false),
  })
}
