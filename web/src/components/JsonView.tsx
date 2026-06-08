import { cn } from '@/lib/utils'

/** Pretty-prints arbitrary JSON (input/return/config) in a mono code block. */
export function JsonView({ json, className }: { json: unknown; className?: string }) {
  if (json === undefined || json === null) {
    return <span className="text-muted-foreground">—</span>
  }
  const text = typeof json === 'string' ? json : JSON.stringify(json, null, 2)
  return (
    <pre
      className={cn(
        'overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words',
        className,
      )}
    >
      {text}
    </pre>
  )
}
