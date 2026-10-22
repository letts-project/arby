import { Fragment } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { LaneSlots } from './LaneSlots'
import { LaneToggle } from './LaneToggle'
import { Ago } from './Ago'
import { Tip } from './Tip'
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

function RunningCell({ running, concurrency, search }: { running: number; concurrency: number; search: Record<string, string> }) {
  return (
    <>
      {running > 0 ? (
        <Link
          to="/missions"
          search={{ state: 'running', ...search }}
          onClick={(e) => e.stopPropagation()}
          className="text-status-running hover:underline"
        >
          {running}
        </Link>
      ) : (
        <span className="text-faint">0</span>
      )}
      <span className="text-faint">/{concurrency}</span>
    </>
  )
}

function WaitingCell({ queued, held, search }: { queued: number; held: boolean; search: Record<string, string> }) {
  if (queued === 0) return <span className="text-faint">0</span>
  return (
    <Link
      to="/missions"
      search={{ state: 'queued', ...search }}
      onClick={(e) => e.stopPropagation()}
      className={cn('font-medium hover:underline', held ? 'text-status-warn' : 'text-foreground')}
    >
      {queued}
    </Link>
  )
}

function LaneRow({ l, indent }: { l: LaneStatus; indent: string }) {
  const search = { host: l.host, lane: l.name }
  return (
    <tr className={cn(l.paused && 'text-status-warn')}>
      <td className={cn('truncate py-1 pr-3', indent)}>
        <Link
          to="/missions"
          search={search}
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
        <RunningCell running={l.running} concurrency={l.concurrency} search={search} />
      </td>
      <td className="px-3 py-1 text-right">
        <WaitingCell queued={l.queued} held={l.paused} search={search} />
      </td>
      <td className="py-1 pl-3 text-right">
        <LaneToggle host={l.host} lane={l.name} paused={l.paused} />
      </td>
    </tr>
  )
}

/** One dugdale folded into a single row: health, slots and backlog summed over
 *  its lanes, and how many lanes are paused. Clicking it shows the lanes. */
function HostSummaryRow({
  host,
  lanes,
  reason,
  open,
  onToggle,
}: {
  host: HostStatus
  lanes: LaneStatus[]
  reason?: string
  open: boolean
  onToggle: () => void
}) {
  const live = host.online && host.managed
  const sum = (f: (l: LaneStatus) => number) => lanes.reduce((n, l) => n + f(l), 0)
  const paused = lanes.filter((l) => l.paused)
  const held = paused.some((l) => l.queued > 0)
  const search = { host: host.id }
  const name = host.managed ? (
    <Link to="/dugdales/$host" params={{ host: host.id }} onClick={(e) => e.stopPropagation()} className="font-semibold hover:underline">
      {host.id}
    </Link>
  ) : (
    <span className="font-semibold">{host.id}</span>
  )
  return (
    <tr
      onClick={live ? onToggle : undefined}
      className={cn('border-t', live && 'cursor-pointer hover:bg-muted/60')}
    >
      <td className="truncate py-1.5 pr-3">
        <span className="inline-flex items-center gap-1.5">
          {live ? (
            <Tip label={open ? 'Hide lanes' : 'Show lanes'}>
              <button
                type="button"
                aria-expanded={open}
                aria-label={`${open ? 'Hide' : 'Show'} lanes of ${host.id}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle()
                }}
                className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
              </button>
            </Tip>
          ) : (
            <span className="size-5" />
          )}
          {name}
          {live && <span className="text-muted-foreground">up {fmtDuration((host.uptime_seconds ?? 0) * 1000)}</span>}
        </span>
      </td>
      {!host.online ? (
        <td colSpan={4} className="truncate px-3 py-1.5 text-status-failed">
          <Tip label={reason ?? 'not responding'}>
            <span>unreachable</span>
          </Tip>
        </td>
      ) : !host.managed ? (
        <td colSpan={4} className="truncate px-3 py-1.5 text-muted-foreground">
          up, not managed by arby
        </td>
      ) : (
        <>
          <td className="px-3 py-1.5">
            <LaneSlots
              running={sum((l) => l.running)}
              concurrency={sum((l) => l.concurrency)}
              paused={lanes.length > 0 && paused.length === lanes.length}
            />
          </td>
          <td className="px-3 py-1.5 text-right">
            <RunningCell running={sum((l) => l.running)} concurrency={sum((l) => l.concurrency)} search={search} />
          </td>
          <td className="px-3 py-1.5 text-right">
            <WaitingCell queued={sum((l) => l.queued)} held={held} search={search} />
          </td>
          <td className="py-1.5 pl-3 text-right whitespace-nowrap">
            {paused.length > 0 && (
              <span className="font-medium text-status-warn">
                {paused.length} paused
              </span>
            )}
          </td>
        </>
      )}
    </tr>
  )
}

/**
 * Every lane, grouped under its dugdale: slot usage, backlog and pause/continue.
 * Counts link into the missions list filtered to that lane. With `onToggle`,
 * each dugdale is one summary row and its lanes show only when expanded.
 */
export function QueuesTable({
  hosts,
  lanes,
  reasons,
  className,
  detailed = false,
  hostHeaders = true,
  expanded,
  onToggle,
}: {
  hosts: HostStatus[]
  lanes: LaneStatus[]
  reasons?: UnavailableReasons
  className?: string
  detailed?: boolean
  hostHeaders?: boolean
  expanded?: Set<string>
  onToggle?: (host: string) => void
}) {
  const byHost = new Map<string, LaneStatus[]>()
  for (const l of lanes) byHost.set(l.host, [...(byHost.get(l.host) ?? []), l])
  const collapsible = !!onToggle
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
          <th className="py-1.5 pr-3 text-left font-medium">{collapsible ? 'Dugdale' : 'Lane'}</th>
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
          const open = !collapsible || !!expanded?.has(h.id)
          const indent = collapsible ? 'pl-[26px]' : hostHeaders ? 'pl-3' : ''
          return (
            <Fragment key={h.id}>
              {collapsible ? (
                <HostSummaryRow host={h} lanes={hl} reason={reasons?.[h.id]} open={open} onToggle={() => onToggle(h.id)} />
              ) : (
                hostHeaders && (
                  <tr className="border-t">
                    <td colSpan={5} className="pt-3 pb-1">
                      <HostLine host={h} reason={reasons?.[h.id]} detailed={detailed} />
                    </td>
                  </tr>
                )
              )}
              {open && hl.map((l) => <LaneRow key={l.name} l={l} indent={indent} />)}
              {open && h.online && h.managed && hl.length === 0 && (
                <tr>
                  <td colSpan={5} className={cn('pb-1 text-muted-foreground', indent)}>
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
