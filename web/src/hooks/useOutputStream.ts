import { useEffect, useRef, useState } from 'react'
import { parseOutputLine } from '@/lib/sse'
import type { OutputLine } from '@/lib/types'

export interface OutputStreamState {
  lines: OutputLine[]
  connected: boolean
  /** Set when the stream/fetch failed — distinguishes "no output" from "couldn't load output". */
  error?: string
  /** True when old lines were dropped to honor maxLines. */
  trimmed: boolean
}

/** Retained line cap: beyond this the oldest lines are dropped (and `trimmed`
 *  set) so a chatty mission can't grow the pane without bound. */
const maxLines = 5000

/** parseErrorPayload extracts the message from a stream_error data payload. */
function parseErrorPayload(raw: string): string {
  try {
    const v = JSON.parse(raw) as { message?: string }
    if (v && typeof v.message === 'string' && v.message !== '') return v.message
  } catch {
    /* fall through */
  }
  return 'output stream failed'
}

/**
 * useOutputStream tails /api/missions/:host/:id/output.
 *
 * - **live** (running mission): an EventSource. The /output relay has no seq, so
 *   on each (re)connect the upstream restarts from the start of the file; we
 *   reset and redraw the pane in onopen to avoid dupes. Lines are buffered and
 *   flushed once per animation frame — per-message state updates would re-render
 *   the whole pane for every output line.
 * - **terminal** (done mission): the relay streams the archive once then EOFs. An
 *   EventSource would auto-reconnect and re-stream forever, so we instead do a
 *   single fetch, read the body to EOF, parse the SSE frames, and stop.
 *
 * A `stream_error` SSE event (the relay's upstream read failed mid-stream)
 * surfaces as `error` so a truncated log is never presented as the complete
 * archive.
 */
export function useOutputStream(
  host: string,
  id: string,
  { enabled, terminal }: { enabled: boolean; terminal: boolean },
): OutputStreamState {
  const [lines, setLines] = useState<OutputLine[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [trimmed, setTrimmed] = useState(false)
  const buf = useRef<OutputLine[]>([])
  const raf = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    const url = `/api/missions/${encodeURIComponent(host)}/${encodeURIComponent(id)}/output`
    buf.current = []
    setLines([])
    setError(undefined)
    setTrimmed(false)

    const capBuf = () => {
      if (buf.current.length > maxLines) {
        buf.current.splice(0, buf.current.length - maxLines)
        setTrimmed(true)
      }
    }
    const flush = () => {
      raf.current = null
      capBuf()
      setLines(buf.current.slice())
    }
    const scheduleFlush = () => {
      if (raf.current == null) raf.current = requestAnimationFrame(flush)
    }

    if (terminal) {
      const ac = new AbortController()
      setConnected(true)
      void (async () => {
        try {
          const res = await fetch(url, { signal: ac.signal, headers: { Accept: 'text/event-stream' } })
          if (!res.ok) {
            const text = await res.text()
            let msg = `HTTP ${res.status}`
            try {
              const e = JSON.parse(text) as { message?: string }
              if (e?.message) msg = e.message
            } catch {
              /* keep the status text */
            }
            setError(msg)
            return
          }
          if (!res.body) return
          const reader = res.body.getReader()
          const dec = new TextDecoder()
          let pending = ''
          let eventName = ''
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            pending += dec.decode(value, { stream: true })
            const nl = pending.lastIndexOf('\n')
            if (nl === -1) continue
            const chunk = pending.slice(0, nl)
            pending = pending.slice(nl + 1)
            for (const line of chunk.split('\n')) {
              if (line === '') {
                eventName = ''
                continue
              }
              if (line.startsWith('event:')) {
                eventName = line.slice(6).trim()
                continue
              }
              if (!line.startsWith('data:')) continue
              const payload = line.slice(5).trim()
              if (eventName === 'stream_error') {
                setError(parseErrorPayload(payload))
                continue
              }
              const l = parseOutputLine(payload)
              if (l) buf.current.push(l)
            }
            capBuf()
            setLines(buf.current.slice())
          }
          capBuf()
          setLines(buf.current.slice())
        } catch (e) {
          if (!ac.signal.aborted) setError(e instanceof Error ? e.message : String(e))
        } finally {
          setConnected(false)
        }
      })()
      return () => ac.abort()
    }

    const es = new EventSource(url)
    es.onopen = () => {
      buf.current = []
      setLines([])
      setTrimmed(false)
      setConnected(true)
    }
    es.onmessage = (m) => {
      const l = parseOutputLine(m.data)
      if (!l) return
      setError(undefined) // data is flowing again after a reported failure
      buf.current.push(l)
      scheduleFlush()
    }
    es.addEventListener('stream_error', (m) => {
      // The relay lost its upstream mid-stream; EventSource will reconnect and
      // re-render from scratch. Keep the error visible until data flows again.
      setError(parseErrorPayload((m as MessageEvent).data as string))
    })
    es.onerror = () => setConnected(false)
    return () => {
      es.close()
      if (raf.current != null) cancelAnimationFrame(raf.current)
    }
  }, [host, id, enabled, terminal])

  return { lines, connected, error, trimmed }
}
