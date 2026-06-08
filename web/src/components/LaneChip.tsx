import { cn } from '@/lib/utils'

/** A small accent chip for a lane name. */
export function LaneChip({ lane, className }: { lane?: string; className?: string }) {
  if (!lane) return <span className="text-muted-foreground">—</span>
  return (
    <span
      className={cn(
        'inline-flex items-center rounded bg-accent px-1.5 py-0.5 font-mono text-[11px] text-accent-foreground',
        className,
      )}
    >
      {lane}
    </span>
  )
}
