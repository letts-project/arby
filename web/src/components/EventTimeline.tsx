import { Loader2 } from 'lucide-react'
import { useEventStream } from '@/hooks/useEventStream'
import { fmtTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { MissionEvent } from '@/lib/types'

const EVENT_TONE: Record<string, string> = {
  queued: 'text-status-queued',
  running: 'text-status-running',
  progress: 'text-muted-foreground',
  done: 'text-foreground',
  return: 'text-muted-foreground',
}

function eventTime(ev: MissionEvent): number | undefined {
  return ev.time_finished || ev.time_started || ev.time_created || ev.time
}

function summarize(ev: MissionEvent): string {
  switch (ev.event) {
    case 'queued':
      return ev.lane ? `lane ${ev.lane}` : ''
    case 'running':
      return ev.pid ? `pid ${ev.pid}` : ''
    case 'progress':
      return [ev.value != null ? `${Math.round(ev.value * 100)}%` : '', ev.message ?? ''].filter(Boolean).join(' · ')
    case 'done':
      return [ev.outcome, ev.exit_code != null ? `exit ${ev.exit_code}` : '', ev.signal ? `sig ${ev.signal}` : '']
        .filter(Boolean)
        .join(' · ')
    default:
      return ev.message ?? ''
  }
}

/** Live event timeline: a progress bar from the latest `progress`, then the
 *  ordered event log; terminal `done` is highlighted. */
export function EventTimeline({ host, id, enabled }: { host: string; id: string; enabled: boolean }) {
  const { events, latestProgress, done, failed } = useEventStream(host, id, enabled)
  const pct = latestProgress?.value != null ? Math.round(latestProgress.value * 100) : null

  return (
    <div className="space-y-4 p-4">
      {pct != null && !done && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-muted-foreground">{latestProgress?.message || 'In progress'}</span>
            <span className="font-mono tabular">{pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-status-running transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {events.length === 0 ? (
        failed ? (
          <div className="font-mono text-[12px] text-status-failed">
            Couldn’t load events — the stream keeps failing.
          </div>
        ) : (
          <div className="flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Loading events…
          </div>
        )
      ) : (
        <ol className="space-y-0">
          {events.map((ev) => (
            <li key={ev.seq} className="flex items-baseline gap-3 border-b py-1.5 last:border-0">
              <span className="w-14 shrink-0 font-mono text-[11px] tabular text-muted-foreground">#{ev.seq}</span>
              <span className={cn('w-20 shrink-0 text-[12px] font-medium uppercase', EVENT_TONE[ev.event])}>
                {ev.event}
              </span>
              <span className="flex-1 truncate font-mono text-[12px]">{summarize(ev)}</span>
              <span className="shrink-0 font-mono text-[11px] tabular text-muted-foreground">
                {fmtTime(eventTime(ev))}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
