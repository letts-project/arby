import { useEffect, useMemo, useRef } from 'react'
import { keepPreviousData, useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { apiGet, type QueryParams } from '@/lib/api'
import { useInteractionLocked } from '@/lib/interactionLock'
import type { MergedMission, MissionsPage } from '@/lib/types'

const POLL_MS = 5000

/**
 * A cursor-paged list loaded page by page as the user scrolls. It polls only
 * while `live` (the view is scrolled to the top) and nothing interactive is
 * open; on returning to the top it drops every page but the first, so a poll
 * refetches one page rather than everything scrolled through.
 */
export function useInfiniteList(key: 'missions' | 'execs', path: string, filter: object, live: boolean) {
  const qc = useQueryClient()
  const locked = useInteractionLocked()
  const queryKey = [key, 'infinite', filter]
  const keyRef = useRef(queryKey)
  keyRef.current = queryKey

  const q = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => apiGet<MissionsPage>(path, { ...(filter as QueryParams), cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor || undefined,
    refetchInterval: live && !locked ? POLL_MS : false,
    placeholderData: keepPreviousData,
  })

  const wasLive = useRef(live)
  useEffect(() => {
    const back = live && !wasLive.current
    wasLive.current = live
    if (!back) return
    qc.setQueryData<InfiniteData<MissionsPage, string | undefined>>(keyRef.current, (d) =>
      d && d.pages.length > 1 ? { pages: d.pages.slice(0, 1), pageParams: d.pageParams.slice(0, 1) } : d,
    )
    void qc.invalidateQueries({ queryKey: keyRef.current, exact: true })
  }, [live, qc])

  const items = useMemo(() => {
    const seen = new Set<string>()
    const out: MergedMission[] = []
    for (const page of q.data?.pages ?? []) {
      for (const m of page.items) {
        const k = `${m.host}/${m.mission_id}`
        if (seen.has(k)) continue
        seen.add(k)
        out.push(m)
      }
    }
    return out
  }, [q.data])

  const first = q.data?.pages[0]
  return {
    ...q,
    items,
    unavailableHosts: first?.unavailable_hosts,
    unavailableReasons: first?.unavailable_reasons,
  }
}
