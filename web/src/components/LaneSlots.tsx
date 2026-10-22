import { cn } from '@/lib/utils'
import { Tip } from './Tip'

const MAX_CELLS = 12

/** A lane's concurrency as a row of slots, the busy ones filled. Paused lanes
 *  draw their free slots hatched. Past MAX_CELLS slots it becomes a bar. */
export function LaneSlots({
  running,
  concurrency,
  paused,
  className,
}: {
  running: number
  concurrency: number
  paused?: boolean
  className?: string
}) {
  const label = `${running} of ${concurrency} slots busy${paused ? ', paused' : ''}`
  if (concurrency > MAX_CELLS) {
    const pct = concurrency > 0 ? Math.min(100, (running / concurrency) * 100) : 0
    return (
      <Tip label={label}>
        <span role="img" aria-label={label} className={cn('inline-flex h-3 w-[132px] overflow-hidden rounded-[2px] border border-border-strong', className)}>
          <span className="h-full bg-status-running" style={{ width: `${pct}%` }} />
        </span>
      </Tip>
    )
  }
  return (
    <Tip label={label}>
      <span role="img" aria-label={label} className={cn('inline-flex gap-[3px]', className)}>
        {Array.from({ length: Math.max(concurrency, 1) }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-3 w-2 rounded-[2px]',
              i < running
                ? 'bg-status-running'
                : paused
                  ? 'border border-status-warn/70 bg-[repeating-linear-gradient(135deg,var(--status-warn)_0_1px,transparent_1px_4px)] opacity-80'
                  : 'border border-border-strong',
            )}
          />
        ))}
      </span>
    </Tip>
  )
}
