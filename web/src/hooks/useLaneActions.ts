import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiMutate } from '@/lib/api'
import type { LaneStatus } from '@/lib/types'

type WithLanes = { lanes: LaneStatus[] }
const KEYS = [['lanes'], ['dashboard']] as const

/**
 * Pause / continue a lane. Optimistically flips the lane's `paused` in every
 * cache that lists lanes so the row updates instantly — the reconciling
 * refetch fans out to every dugdale and can take seconds. Rolls back on error
 * and reconciles on settle.
 */
export function useLaneActions() {
  const qc = useQueryClient()

  const settle = () => {
    for (const k of KEYS) qc.invalidateQueries({ queryKey: k })
  }
  const onMutate = (paused: boolean) => async (v: { host: string; lane: string }) => {
    const prev: [readonly string[], WithLanes | undefined][] = []
    for (const k of KEYS) {
      await qc.cancelQueries({ queryKey: k })
      const old = qc.getQueryData<WithLanes>(k)
      prev.push([k, old])
      if (old) {
        qc.setQueryData<WithLanes>(k, {
          ...old,
          lanes: old.lanes.map((l) => (l.host === v.host && l.name === v.lane ? { ...l, paused } : l)),
        })
      }
    }
    return { prev }
  }
  const onError = (_e: unknown, _v: unknown, ctx: { prev: [readonly string[], WithLanes | undefined][] } | undefined) => {
    for (const [k, old] of ctx?.prev ?? []) if (old) qc.setQueryData(k, old)
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
