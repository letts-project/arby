import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { readCookie } from '@/lib/cookies'
import { ThemeToggle } from './ThemeToggle'
import { GlobalSearch } from './GlobalSearch'
import { ClusterHealth } from './ClusterHealth'
import { Logo } from './Logo'

// Published by the server as a cookie on the entry document; empty under `vite dev`.
const ARBY_VERSION = readCookie('arby_version')

const NAV: { to: string; label: string; exact?: boolean }[] = [
  { to: '/', label: 'Overview', exact: true },
  { to: '/missions', label: 'Missions' },
  { to: '/exec', label: 'Exec' },
  { to: '/dugdales', label: 'Dugdales' },
]

/** Top bar (wordmark, sections, search, cluster health, theme) over a single
 *  full-width content column. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-stretch gap-4 border-b bg-chrome px-5 lg:gap-6">
        <Link to="/" className="flex items-center gap-1.5 self-center">
          <Logo />
          <span className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold tracking-tight">arby</span>
            <span className="text-[12px] text-faint">{ARBY_VERSION && ARBY_VERSION !== 'dev' ? ARBY_VERSION : 'dev'}</span>
          </span>
        </Link>
        <nav className="flex items-stretch gap-1">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.exact, includeSearch: false }}
              className="relative flex items-center px-2.5 text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{
                className: 'text-foreground font-medium after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:bg-foreground',
              }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-3 lg:gap-4">
          <ClusterHealth />
          <GlobalSearch />
          <ThemeToggle />
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">{children}</main>
    </div>
  )
}
