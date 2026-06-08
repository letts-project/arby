import type { ReactNode } from 'react'
import { NavSidebar } from './NavSidebar'

/** Top-level layout: fixed nav rail and a single scrolling content column. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <NavSidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
