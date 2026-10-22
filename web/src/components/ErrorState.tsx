import { errorMessage } from '@/lib/api'

/** Failure placeholder with the error message and an optional retry. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-1 px-5 py-10">
      <p className="font-medium text-status-failed">Couldn’t load this.</p>
      <p className="max-w-xl text-muted-foreground">{errorMessage(error)}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-1 underline underline-offset-4 hover:text-foreground">
          Try again
        </button>
      )}
    </div>
  )
}
