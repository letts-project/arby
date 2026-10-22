import { cn } from '@/lib/utils'

/** Where a mission runs, as `host/lane`. */
export function Where({ host, lane, className }: { host: string; lane?: string; className?: string }) {
  return (
    <span className={cn('whitespace-nowrap', className)}>
      {host}
      {lane && <span className="text-muted-foreground">/{lane}</span>}
    </span>
  )
}
