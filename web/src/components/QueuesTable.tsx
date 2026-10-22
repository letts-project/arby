import { Fragment } from 'react'
import { Link } from '@tanstack/react-router'
import { LaneSlots } from './LaneSlots'
import { LaneToggle } from './LaneToggle'
import { Ago } from './Ago'
import { fmtDuration } from '@/lib/format'
import { sortBy } from '@/lib/sort'
import { cn } from '@/lib/utils'
import type { HostStatus, LaneStatus, UnavailableReasons } from '@/lib/types'

/** HostLine is the dugdale's identity and health, used as a group header. */
export function HostLine({
  host,
  reason,
  detailed = false,
  named = true,
}: {
  host: HostStatus
  reason?: string
  detailed?: boolean
  named?: boolean
}) {
  const name = <span className="font-semibold">{host.id}</span>
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
      {!named ? null : host.managed ? (
        <Link to="/dugdales/$host" params={{ host: host.id }} className="hover:underline">
          {name}
        </Link>
      ) : (
        name
      )}
      {!host.online ? (
        <span className="max-w-full min-w-0 truncate text-status-failed" title={reason}>
          unreachable{reason ? `: ${reason}` : ''}
        </span>
      ) : !host.managed ? (
        <span className="text-muted-foreground" title="No admin token for this dugdale in letts.yaml">
          up, not managed by arby
        </span>
      ) : (
        <span className="text-muted-foreground">up {fmtDuration((host.uptime_seconds ?? 0) * 1000)}</span>
      )}
      {detailed && host.online && host.version && <span className="text-muted-foreground">version {host.version}</span>}
      {detailed && host.online && host.applied_at && (
        <span className="text-muted-foreground">
          config applied <Ago ms={host.applied_at} />
        </span>
      )}
      {(host.labels ?? []).length > 0 && <span className="text-muted-foreground">{Array.from(new Set(host.labels)).join(', ')}</span>}
    </div>
  )
}

/**
 * Every lane, grouped under its dugdale: slot usage, backlog and pause/continue.
 * Counts link into the missions list filtered to that lane.
 */
export function QueuesTable({
  hosts,
  lanes,
  reasons,
  className,
  detailed = false,
  hostHeaders = true,
}: {
  hosts: HostStatus[]
  lanes: LaneStatus[]
  reasons?: UnavailableReasons
  className?: string
  detailed?: boolean
  hostHeaders?: boolean
}) {
  const byHost = new Map<string, LaneStatus[]>()
  for (const l of lanes) byHost.set(l.host, [...(byHost.get(l.host) ?? []), l])
  return (
    <table className={cn('w-full table-fixed border-collapse', className)}>
      <colgroup>
        <col />
        <col className="w-[120px]" />
        <col className="w-[72px]" />
        <col className="w-[72px]" />
        <col className="w-[96px]" />
      </colgroup>
      <thead>
        <tr className="text-[12px] text-muted-foreground">
          <th className="py-1.5 pr-3 text-left font-medium">Lane</th>
          <th className="px-3 py-1.5 text-left font-medium">Slots</th>
          <th className="px-3 py-1.5 text-right font-medium">Running</th>
          <th className="px-3 py-1.5 text-right font-medium">Waiting</th>
          <th className="py-1.5 pl-3 text-right font-medium">
            <span className="sr-only">Action</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {sortBy(hosts, (h) => h.id, 'asc').map((h) => {
          const hl = sortBy(byHost.get(h.id) ?? [], (l) => l.name, 'asc')
          return (
            <Fragment key={h.id}>
              {hostHeaders && (
                <tr className="border-t">
                  <td colSpan={5} className="pt-3 pb-1">
                    <HostLine host={h} reason={reasons?.[h.id]} detailed={detailed} />
                  </td>
                </tr>
              )}
              {hl.map((l) => (
                <tr key={l.name} className={cn(l.paused && 'text-status-warn')}>
                  <td className={cn('truncate py-1 pr-3', hostHeaders && 'pl-3')}>
                    <Link
                      to="/missions"
                      search={{ host: l.host, lane: l.name }}
                      className={cn('hover:underline', l.paused ? 'text-status-warn' : 'text-foreground')}
                    >
                      {l.name}
                    </Link>
                    {l.paused && <span className="ml-2 font-medium">paused</span>}
                  </td>
                  <td className="px-3 py-1">
                    <LaneSlots running={l.running} concurrency={l.concurrency} paused={l.paused} />
                  </td>
                  <td className="px-3 py-1 text-right">
                    {l.running > 0 ? (
                      <Link to="/missions" search={{ state: 'running', host: l.host, lane: l.name }} className="text-status-running hover:underline">
                        {l.running}
                      </Link>
                    ) : (
                      <span className="text-faint">0</span>
                    )}
                    <span className="text-faint">/{l.concurrency}</span>
                  </td>
                  <td className="px-3 py-1 text-right">
                    {l.queued > 0 ? (
                      <Link
                        to="/missions"
                        search={{ state: 'queued', host: l.host, lane: l.name }}
                        className={cn('font-medium hover:underline', l.paused ? 'text-status-warn' : 'text-foreground')}
                      >
                        {l.queued}
                      </Link>
                    ) : (
                      <span className="text-faint">0</span>
                    )}
                  </td>
                  <td className="py-1 pl-3 text-right">
                    <LaneToggle host={l.host} lane={l.name} paused={l.paused} />
                  </td>
                </tr>
              ))}
              {h.online && h.managed && hl.length === 0 && (
                <tr>
                  <td colSpan={5} className={cn('pb-1 text-muted-foreground', hostHeaders && 'pl-3')}>
                    No lanes applied.
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}
