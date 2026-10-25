import { History } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { fmtTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Mission, MissionEvent } from '@/lib/types'

function percentage(value?: number): number | null {
  return value != null && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value * 100))) : null
}

export function MissionProgress({
  m,
  events,
  historyOpen,
  onHistoryOpenChange,
}: {
  m: Pick<Mission, 'status' | 'outcome'>
  events: MissionEvent[]
  historyOpen: boolean
  onHistoryOpenChange: (open: boolean) => void
}) {
  const latest = events[events.length - 1]
  if (!latest) return null
  let pct: number | null = null
  for (const ev of events) {
    const value = percentage(ev.value)
    if (value != null) pct = value
  }
  const tone =
    m.status !== 'done'
      ? 'bg-status-running'
      : m.outcome === 'success'
        ? 'bg-status-success'
        : m.outcome === 'killed'
          ? 'bg-status-warn'
          : 'bg-status-failed'

  return (
    <Dialog open={historyOpen} onOpenChange={onHistoryOpenChange}>
      <div className="mt-4">
        <div className="mb-2 flex items-center gap-3">
          <span className="font-semibold">Progress</span>
          {pct != null && <span className="font-semibold tabular-nums">{pct}%</span>}
          <span className="min-w-0 flex-1 truncate text-muted-foreground" title={latest.message}>
            {latest.message}
          </span>
          <DialogTrigger asChild>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1.5 rounded px-1 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="View progress history"
            >
              <History className="size-3.5" />
              History <span className="text-faint">{events.length}</span>
            </button>
          </DialogTrigger>
        </div>
        {pct != null && (
          <div
            role="progressbar"
            aria-label="Mission progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn('h-full rounded-full transition-[width] duration-500', tone)}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="px-5 pt-5 pb-4 text-left">
            <DialogTitle>Progress history</DialogTitle>
            <DialogDescription>
              {events.length} {events.length === 1 ? 'update' : 'updates'} · oldest first
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto border-t">
            <table className="w-full table-fixed text-left">
              <thead className="sticky top-0 bg-muted text-[12px] text-muted-foreground">
                <tr>
                  <th className="w-24 py-2 pl-5 font-medium">Time</th>
                  <th className="w-20 px-3 py-2 font-medium">Progress</th>
                  <th className="px-3 py-2 pr-5 font-medium">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {events.map((ev) => {
                  const value = percentage(ev.value)
                  return (
                    <tr key={ev.seq} className="align-top">
                      <td className="py-2.5 pl-5 text-[12px] text-muted-foreground" title={fmtTime(ev.time)}>
                        {ev.time != null ? new Date(ev.time).toLocaleTimeString(undefined, { hour12: false }) : '—'}
                      </td>
                      <td className="px-3 py-2.5 font-medium tabular-nums">{value != null ? `${value}%` : '—'}</td>
                      <td className="px-3 py-2.5 pr-5 whitespace-pre-wrap break-words">{ev.message || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </div>
    </Dialog>
  )
}
