import type { ReactNode } from 'react'

/** Placeholder for a list or panel with nothing to show. */
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1 px-5 py-10">
      <p className="font-medium">{title}</p>
      {hint && <p className="text-muted-foreground">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
