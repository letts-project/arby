import { cn } from '@/lib/utils'
import type { Mission } from '@/lib/types'

const TONE = {
  running: 'text-status-running border-status-running/30 bg-status-running/10',
  success: 'text-status-success border-status-success/30 bg-status-success/10',
  queued: 'text-status-queued border-status-queued/30 bg-status-queued/10',
  failed: 'text-status-failed border-status-failed/30 bg-status-failed/10',
  warn: 'text-status-warn border-status-warn/30 bg-status-warn/10',
} as const

/** toneFor maps a mission's status/outcome to a label and color tone. */
function toneFor(m: Pick<Mission, 'status' | 'outcome'>): { label: string; tone: string; live?: boolean } {
  if (m.status === 'running') return { label: 'running', tone: TONE.running, live: true }
  if (m.status === 'queued') return { label: 'queued', tone: TONE.queued }
  if (m.status === 'deleting') return { label: 'deleting', tone: TONE.warn }
  const o = m.outcome ?? 'done'
  if (o === 'success') return { label: 'success', tone: TONE.success }
  if (o === 'killed' || o === 'timeout') return { label: o, tone: TONE.warn }
  return { label: o, tone: TONE.failed } // failed / crashed / oom / lost
}

/** A compact colored status pill. Running pulses a leading dot. */
export function StatusBadge({
  mission,
  className,
}: {
  mission: Pick<Mission, 'status' | 'outcome'>
  className?: string
}) {
  const { label, tone, live } = toneFor(mission)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide',
        tone,
        className,
      )}
    >
      {live && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {label}
    </span>
  )
}
