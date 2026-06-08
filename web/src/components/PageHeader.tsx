import type { ReactNode } from 'react'

/** A consistent sticky screen header: title, optional count chip, right-side slot. */
export function PageHeader({ title, count, children }: { title: string; count?: number; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2.5 border-b bg-background/95 px-4 backdrop-blur">
      <h1 className="text-sm font-semibold">{title}</h1>
      {count != null && (
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] tabular text-muted-foreground">
          {count}
        </span>
      )}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </header>
  )
}
