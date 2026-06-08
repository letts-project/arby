import type { ReactNode } from 'react'

/** Centered empty-state placeholder for lists/panels with no data. */
export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-16 text-center">
      {icon && <div className="mb-1 text-muted-foreground/50">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-sm text-[12px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
