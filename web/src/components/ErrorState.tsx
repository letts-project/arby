import { AlertTriangle } from 'lucide-react'

/** Centered error placeholder with the failure message and an optional retry. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error)
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <AlertTriangle className="size-5 text-status-failed" />
      <p className="text-sm font-medium text-status-failed">Failed to load</p>
      <p className="max-w-md text-[12px] text-muted-foreground">{msg}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-md border px-2.5 py-1 text-[12px] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Retry
        </button>
      )}
    </div>
  )
}
