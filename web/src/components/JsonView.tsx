import { cn } from '@/lib/utils'

/** Pretty-printed JSON (input/return/config) in a mono block. */
export function JsonView({ json, className, empty = '—' }: { json: unknown; className?: string; empty?: string }) {
  if (json === undefined || json === null) {
    return <span className="text-faint">{empty}</span>
  }
  const text = typeof json === 'string' ? json : JSON.stringify(json, null, 2)
  return (
    <pre
      className={cn(
        'overflow-auto rounded-md bg-muted px-3 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words',
        className,
      )}
    >
      {text}
    </pre>
  )
}
