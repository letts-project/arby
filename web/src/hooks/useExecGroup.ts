import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import type { ExecGroupResult } from '@/lib/types'

/** All exec missions of one bulk session (group_id), polled every 4s. */
export function useExecGroup(groupId: string) {
  return useQuery({
    queryKey: ['execGroup', groupId],
    queryFn: () => apiGet<ExecGroupResult>(`/api/exec/groups/${encodeURIComponent(groupId)}`),
    refetchInterval: 4000,
  })
}
