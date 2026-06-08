import { useEffect, useRef, useState } from 'react'
import { ArrowDown, Loader2 } from 'lucide-react'
import { useOutputStream } from '@/hooks/useOutputStream'
import { cn } from '@/lib/utils'
import type { Mission } from '@/lib/types'

/**
 * The live/archived output pane. Renders interleaved stdout/stderr chunks in a
 * mono block (stderr tinted), auto-sticking to the bottom unless the user
 * scrolls up. Resets+redraws on reconnect (handled in the hook).
 */
export function LogPane({
  host,
  id,
  status,
  truncatedStdout,
  truncatedStderr,
}: {
  host: string
  id: string
  status: Mission['status']
  truncatedStdout?: boolean
  truncatedStderr?: boolean
}) {
  const terminal = status === 'done'
  const { lines, connected, error, trimmed } = useOutputStream(host, id, { enabled: true, terminal })
  const ref = useRef<HTMLDivElement>(null)
  const [stick, setStick] = useState(true)

  useEffect(() => {
    if (stick && ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [lines, stick])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 24)
  }

  return (
    <div className="relative h-full">
      <div ref={ref} onScroll={onScroll} className="h-full overflow-auto bg-card p-3">
        {lines.length === 0 ? (
          error ? (
            <span className="font-mono text-[12px] text-status-failed">Couldn’t load output: {error}</span>
          ) : terminal && !connected ? (
            <span className="font-mono text-[12px] text-muted-foreground">No output.</span>
          ) : (
            <span className="flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {terminal ? 'Loading output…' : 'Waiting for output…'}
            </span>
          )
        ) : (
          <>
            {trimmed && (
              <div className="mb-2 font-mono text-[12px] text-status-warn">[--- earlier output trimmed ---]</div>
            )}
            <pre className="font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words">
              {lines.map((l, i) => (
                <span key={i} className={l.stream === 'stderr' ? 'text-status-failed' : undefined}>
                  {l.data}
                </span>
              ))}
            </pre>
            {error && (
              <div className="mt-2 font-mono text-[12px] text-status-failed">
                [--- output stream failed: {error} — shown up to this point ---]
              </div>
            )}
          </>
        )}
        {(truncatedStdout || truncatedStderr) && (
          <div className="mt-2 font-mono text-[12px] text-status-warn">[--- output truncated ---]</div>
        )}
      </div>
      {!stick && (
        <button
          type="button"
          onClick={() => setStick(true)}
          className={cn(
            'absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[11px] shadow-sm',
            'transition-colors hover:bg-accent',
          )}
        >
          <ArrowDown className="size-3" />
          Jump to bottom
        </button>
      )}
    </div>
  )
}
