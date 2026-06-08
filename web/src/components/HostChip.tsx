import { cn } from '@/lib/utils'

/** A small mono chip identifying the dugdale a row came from. */
export function HostChip({ host, className }: { host: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground',
        className,
      )}
    >
      {host}
    </span>
  )
}
