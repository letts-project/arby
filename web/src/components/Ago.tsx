import { fmtAgo, fmtTime } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Relative time with the absolute timestamp on hover. */
export function Ago({ ms, className }: { ms?: number; className?: string }) {
  if (!ms) return <span className={cn('text-faint', className)}>—</span>
  return (
    <time dateTime={new Date(ms).toISOString()} title={fmtTime(ms)} className={cn('whitespace-nowrap', className)}>
      {fmtAgo(ms)}
    </time>
  )
}
