import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiMutate } from '@/lib/api'
import type { LanesResult } from '@/lib/types'

/**
 * Pause / continue a lane. Optimistically flips the toggled lane's `paused` in
 * the ['lanes'] cache so the row updates instantly — the reconciling refetch
 * fans out to every dugdale and can take seconds. Rolls back on error and
 * reconciles on settle.
 */
export function useLaneActions() {
  const qc = useQueryClient()

  const setPaused = (host: string, lane: string, paused: boolean) =>
    qc.setQueryData<LanesResult>(['lanes'], (old) =>
      old
        ? { ...old, lanes: old.lanes.map((l) => (l.host === host && l.name === lane ? { ...l, paused } : l)) }
        : old,
    )
  const settle = () => {
    qc.invalidateQueries({ queryKey: ['lanes'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }
  const onMutate = (paused: boolean) => async (v: { host: string; lane: string }) => {
    await qc.cancelQueries({ queryKey: ['lanes'] })
    const prev = qc.getQueryData<LanesResult>(['lanes'])
    setPaused(v.host, v.lane, paused)
    return { prev }
  }
  const onError = (_e: unknown, _v: unknown, ctx: { prev?: LanesResult } | undefined) => {
    if (ctx?.prev) qc.setQueryData(['lanes'], ctx.prev)
  }

  const pause = useMutation({
    mutationFn: (v: { host: string; lane: string }) =>
      apiMutate('POST', `/api/lanes/${encodeURIComponent(v.host)}/${encodeURIComponent(v.lane)}/pause`),
    onMutate: onMutate(true),
    onError,
    onSettled: settle,
  })
  const cont = useMutation({
    mutationFn: (v: { host: string; lane: string }) =>
      apiMutate('POST', `/api/lanes/${encodeURIComponent(v.host)}/${encodeURIComponent(v.lane)}/continue`),
    onMutate: onMutate(false),
    onError,
    onSettled: settle,
  })
  return { pause, cont }
}
