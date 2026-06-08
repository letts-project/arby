import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiMutate } from '@/lib/api'
import type { RestartResult, BulkResponse, BulkItem } from '@/lib/types'

/**
 * Mutations for the single and bulk mission actions. Each invalidates the list
 * and dashboard caches on success (the server also busts its own cache; this
 * keeps the client view fresh without waiting for the next poll).
 */
export function useMissionActions() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['missions'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    // The exec screens reuse these mutations (exec ids are mission ids), so
    // bust the exec caches too — list, detail, and group view.
    qc.invalidateQueries({ queryKey: ['execs'] })
    qc.invalidateQueries({ queryKey: ['exec'] })
    qc.invalidateQueries({ queryKey: ['execGroup'] })
  }

  const restart = useMutation({
    mutationFn: (v: { host: string; id: string }) =>
      apiMutate<RestartResult>('POST', `/api/missions/${encodeURIComponent(v.host)}/${encodeURIComponent(v.id)}/restart`),
    onSuccess: invalidate,
  })
  const kill = useMutation({
    mutationFn: (v: { host: string; id: string; signal?: string }) =>
      apiMutate('POST', `/api/missions/${encodeURIComponent(v.host)}/${encodeURIComponent(v.id)}/kill`, {
        signal: v.signal ?? 'TERM',
      }),
    onSuccess: invalidate,
  })
  const del = useMutation({
    mutationFn: (v: { host: string; id: string; force?: boolean }) =>
      apiMutate('DELETE', `/api/missions/${encodeURIComponent(v.host)}/${encodeURIComponent(v.id)}${v.force ? '?force=true' : ''}`),
    onSuccess: invalidate,
  })
  const bulkRestart = useMutation({
    mutationFn: (items: BulkItem[]) => apiMutate<BulkResponse>('POST', '/api/missions/bulk-restart', { items }),
    onSuccess: invalidate,
  })
  const bulkDelete = useMutation({
    mutationFn: (v: { items: BulkItem[]; force?: boolean }) =>
      apiMutate<BulkResponse>('POST', '/api/missions/bulk-delete', { items: v.items, force: v.force ?? false }),
    onSuccess: invalidate,
  })

  return { restart, kill, del, bulkRestart, bulkDelete }
}
