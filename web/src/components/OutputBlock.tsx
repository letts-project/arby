import { Loader2 } from 'lucide-react'
import { useOutputStream } from '@/hooks/useOutputStream'
import type { Mission } from '@/lib/types'

/** A short, scrollable output view for one run, for pages that show several. */
export function OutputBlock({ host, id, status }: { host: string; id: string; status: Mission['status'] }) {
  const terminal = status === 'done'
  const { lines, connected, error } = useOutputStream(host, id, { enabled: status !== 'queued', terminal })
  if (status === 'queued') return <p className="text-muted-foreground">Not started yet.</p>
  if (lines.length === 0) {
    if (error) return <p className="text-status-failed">Couldn’t load output: {error}</p>
    if (terminal && !connected) return <p className="text-muted-foreground">No output.</p>
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading output…
      </p>
    )
  }
  return (
    <pre className="max-h-80 overflow-auto rounded-md bg-muted px-3 py-2 font-mono text-[12.5px] leading-[1.6] whitespace-pre-wrap break-words">
      {lines.map((l, i) => (
        <span key={i} className={l.stream === 'stderr' ? 'text-status-failed' : undefined}>
          {l.data}
        </span>
      ))}
    </pre>
  )
}
