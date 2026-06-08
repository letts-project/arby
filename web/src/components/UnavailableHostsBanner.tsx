import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import type { UnavailableReasons } from '@/lib/types'

/**
 * A thin warning strip naming dugdales that failed the fan-out. When
 * the API carries per-host reasons it becomes expandable: click to reveal
 * `host — reason` rows, so the cause (timeout / reset / HTTP status) is visible
 * right here without an ssh into journalctl.
 */
export function UnavailableHostsBanner({
  hosts,
  reasons,
}: {
  hosts?: string[]
  reasons?: UnavailableReasons
}) {
  const [open, setOpen] = useState(false)
  const hasReasons = !!reasons && !!hosts && hosts.some((h) => reasons[h])
  // The component stays mounted (renders null) when no host is unavailable, so
  // reset the expanded state once there's nothing to show — otherwise a host
  // that recovers and later fails again would reappear already-expanded.
  useEffect(() => {
    if (!hasReasons) setOpen(false)
  }, [hasReasons])
  if (!hosts || hosts.length === 0) return null
  return (
    <div className="border-b border-status-warn/30 bg-status-warn/10 text-status-warn">
      <button
        type="button"
        disabled={!hasReasons}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={hasReasons ? open : undefined}
        className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-[12px] disabled:cursor-default"
      >
        <AlertTriangle className="size-3.5 shrink-0" />
        <span>
          <span className="font-medium">{hosts.length}</span> host{hosts.length > 1 ? 's' : ''} unavailable:{' '}
          <span className="font-mono">{hosts.join(', ')}</span>
        </span>
        {hasReasons &&
          (open ? (
            <ChevronDown className="size-3.5 shrink-0" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0" />
          ))}
      </button>
      {open && hasReasons && (
        <ul className="space-y-1 px-4 pb-2 pl-9 text-[11px]">
          {hosts.map((h) => (
            <li key={h} className="flex gap-2">
              <span className="shrink-0 font-mono font-medium">{h}</span>
              <span className="break-all font-mono text-status-warn/80">{reasons?.[h] ?? '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
