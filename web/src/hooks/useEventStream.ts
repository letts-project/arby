import { useEffect, useRef, useState } from 'react'
import { parseEvent } from '@/lib/sse'
import type { MissionEvent } from '@/lib/types'

export interface EventStreamState {
  events: MissionEvent[]
  latestProgress?: MissionEvent
  done?: MissionEvent
  connected: boolean
  /** True when the stream is dead (closed for good) or keeps failing with
   *  nothing received — lets the UI say so instead of spinning forever. */
  failed: boolean
}

/**
 * useEventStream tails /api/missions/:host/:id/events. The browser EventSource
 * auto-reconnects and replays Last-Event-ID (the server maps it to ?from=seq),
 * so we de-dupe by seq. The stream closes once a terminal `done` arrives.
 */
export function useEventStream(host: string, id: string, enabled: boolean): EventStreamState {
  const [state, setState] = useState<EventStreamState>({ events: [], connected: false, failed: false })
  const seen = useRef<Set<number>>(new Set())
  const errors = useRef(0)

  useEffect(() => {
    if (!enabled) return
    seen.current = new Set()
    errors.current = 0
    setState({ events: [], connected: false, failed: false })
    const es = new EventSource(
      `/api/missions/${encodeURIComponent(host)}/${encodeURIComponent(id)}/events`,
    )
    es.onopen = () => setState((s) => ({ ...s, connected: true }))
    es.onmessage = (m) => {
      const ev = parseEvent(m.data)
      if (!ev || seen.current.has(ev.seq)) return
      seen.current.add(ev.seq)
      errors.current = 0
      setState((s) => ({
        events: [...s.events, ev],
        latestProgress: ev.event === 'progress' ? ev : s.latestProgress,
        done: ev.event === 'done' ? ev : s.done,
        connected: true,
        failed: false,
      }))
      if (ev.event === 'done') es.close()
    }
    es.onerror = () => {
      // CLOSED → the browser gave up (e.g. the endpoint 404s) and will not
      // retry; repeated errors without a single event → endpoint keeps dying.
      errors.current++
      const dead = es.readyState === EventSource.CLOSED || errors.current >= 2
      setState((s) => ({ ...s, connected: false, failed: dead && s.events.length === 0 }))
    }
    return () => es.close()
  }, [host, id, enabled])

  return state
}
