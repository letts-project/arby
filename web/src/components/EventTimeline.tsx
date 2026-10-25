import { Loader2 } from 'lucide-react'
import { fmtTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { EventStreamState } from '@/hooks/useEventStream'
import type { MissionEvent } from '@/lib/types'

function eventTime(ev: MissionEvent): number | undefined {
  return ev.time_finished || ev.time_started || ev.time_created || ev.time
}

function summarize(ev: MissionEvent): string {
  switch (ev.event) {
    case 'queued':
      return ev.lane ? `in ${ev.lane}` : ''
    case 'running':
      return ev.pid ? `pid ${ev.pid}` : ''
    case 'progress':
      return [ev.value != null ? `${Math.round(ev.value * 100)}%` : '', ev.message ?? ''].filter(Boolean).join('  ')
    case 'done':
      return [ev.outcome, ev.exit_code != null ? `exit ${ev.exit_code}` : '', ev.signal ? ev.signal : '']
        .filter(Boolean)
        .join('  ')
    default:
      return ev.message ?? ''
  }
}

function clock(ms?: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

/** The mission's lifecycle events, oldest first. Runs of progress events are
 *  folded to their latest one so a chatty mission doesn't bury the rest. */
export function EventTimeline({ stream, onShowProgress }: { stream: EventStreamState; onShowProgress?: () => void }) {
  const { events, failed } = stream
  if (events.length === 0) {
    return failed ? (
      <p className="text-status-failed">Couldn’t load events.</p>
    ) : (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading events…
      </p>
    )
  }
  const folded: { ev: MissionEvent; folded: number }[] = []
  for (const ev of events) {
    const last = folded[folded.length - 1]
    if (last && last.ev.event === 'progress' && ev.event === 'progress') {
      folded[folded.length - 1] = { ev, folded: last.folded + 1 }
    } else {
      folded.push({ ev, folded: 0 })
    }
  }
  return (
    <ol className="space-y-1">
      {folded.map(({ ev, folded: n }) => (
        <li key={ev.seq} className="grid grid-cols-[64px_64px_1fr] items-baseline gap-2">
          <span className="text-[12px] text-muted-foreground" title={fmtTime(eventTime(ev))}>
            {clock(eventTime(ev))}
          </span>
          <span className={cn('font-medium', ev.event === 'done' && 'text-foreground', ev.event === 'progress' && 'text-muted-foreground')}>
            {ev.event}
          </span>
          <div className="min-w-0">
            <div className="truncate" title={summarize(ev)}>{summarize(ev)}</div>
            {ev.event === 'progress' && onShowProgress ? (
              <button type="button" onClick={onShowProgress} className="text-[12px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
                View history
              </button>
            ) : n > 0 && <span className="text-muted-foreground">{`${n} earlier`}</span>}
          </div>
        </li>
      ))}
    </ol>
  )
}
