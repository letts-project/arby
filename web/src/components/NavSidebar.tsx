import { Link } from '@tanstack/react-router'
import { Boxes, Gauge, Server, SignalHigh, SquareTerminal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { readCookie } from '@/lib/cookies'
import { ThemeToggle } from './ThemeToggle'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  exact?: boolean
}

// arby's build version, published by the server as a JS-readable cookie on the
// entry document (see server.setVersionCookie). Read once at module load — it is
// static per page load. Empty under `vite dev` (no Go backend) → shown as "dev".
const ARBY_VERSION = readCookie('arby_version')

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: Gauge, exact: true },
  { to: '/missions', label: 'Missions', icon: Boxes },
  { to: '/lanes', label: 'Lanes', icon: SignalHigh },
  { to: '/dugdales', label: 'Dugdales', icon: Server },
  { to: '/exec', label: 'Exec', icon: SquareTerminal },
]

/**
 * The fixed left rail: mono wordmark, tight nav rows, theme toggle in the
 * footer. Active route gets an accent fill and a primary left-marker.
 */
export function NavSidebar() {
  return (
    <aside className="flex w-52 shrink-0 flex-col border-r bg-card">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3.5">
        <Link
          to="/"
          aria-label="arby — dashboard"
          className="flex items-center gap-2 rounded-sm transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid size-5 place-items-center rounded-sm bg-primary font-mono text-[11px] font-bold text-primary-foreground">
            a
          </span>
          <span className="font-mono text-sm font-semibold tracking-tight">arby</span>
        </Link>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          ops
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            activeOptions={{ exact: n.exact }}
            className="group relative flex items-center gap-2.5 rounded-md py-1.5 pl-3 pr-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            activeProps={{
              className:
                'bg-accent font-medium text-foreground before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-primary',
            }}
          >
            <n.icon className="size-4 shrink-0" strokeWidth={2} />
            {n.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center justify-between border-t px-3 py-2">
        <span className="font-mono text-[10px] text-muted-foreground" title="arby version">
          {ARBY_VERSION && ARBY_VERSION !== 'dev' ? `v${ARBY_VERSION}` : 'dev'}
        </span>
        <ThemeToggle />
      </div>
    </aside>
  )
}
