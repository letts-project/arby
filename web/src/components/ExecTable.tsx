import { Link } from '@tanstack/react-router'
import { StatusBadge } from './StatusBadge'
import { Duration } from './Duration'
import { Ago } from './Ago'
import { MissionRowActions } from './MissionRowActions'
import { fmtDuration } from '@/lib/format'
import { failureText, isFailure } from '@/lib/missionView'
import { cn } from '@/lib/utils'
import { useHoverLock } from '@/lib/interactionLock'
import type { ExecRun } from '@/lib/execGroups'

/** Exec history: one row per run; a run on several hosts shows each host's
 *  result inline and opens the group view. */
export function ExecTable({ runs }: { runs: ExecRun[] }) {
  const hover = useHoverLock()
  return (
    <table className="w-full border-collapse">
      <thead className="sticky top-0 z-20 bg-background">
        <tr className="text-[12px] text-muted-foreground">
          <th className="w-[104px] border-b py-2 pr-3 pl-5 text-left font-medium">Status</th>
          <th className="border-b px-3 py-2 text-left font-medium">Command</th>
          <th className="border-b px-3 py-2 text-left font-medium">Hosts</th>
          <th className="w-[1%] border-b px-3 py-2 text-right font-medium">Duration</th>
          <th className="w-[1%] border-b px-3 py-2 text-right font-medium">Started</th>
          <th className="w-[1%] border-b py-2 pr-4 pl-3">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody {...hover}>
        {runs.map((r) => {
          const single = r.members.length === 1 && !r.groupId ? r.members[0] : undefined
          const why = single && isFailure(single) ? failureText(single) : undefined
          return (
            <tr key={r.key} className="group/row relative border-b border-border/70 hover:bg-muted/60 focus-within:bg-muted/60">
              <td className="h-9 py-1 pr-3 pl-5 align-middle whitespace-nowrap">
                {single ? (
                  <Link
                    to="/exec/$host/$id"
                    params={{ host: single.host, id: single.mission_id }}
                    aria-label={`Open exec ${r.command}`}
                    className="absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  />
                ) : (
                  <Link
                    to="/exec/groups/$groupId"
                    params={{ groupId: r.groupId! }}
                    aria-label={`Open exec group ${r.command}`}
                    className="absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  />
                )}
                <StatusBadge mission={r} />
              </td>
              <td className="w-full max-w-0 px-3 py-1 align-middle">
                <span className="block truncate font-mono text-[12.5px]" title={r.command}>
                  {r.command}
                </span>
                {why && (
                  <span className="block truncate text-[12px] text-status-failed" title={why}>
                    {why}
                  </span>
                )}
              </td>
              <td className="px-3 py-1 align-middle whitespace-nowrap">
                <span className="flex items-center gap-3">
                  {r.members.map((m) => (
                    <span key={`${m.host}/${m.mission_id}`} className="inline-flex items-center gap-1">
                      <StatusBadge mission={m} iconOnly />
                      <span className={cn(isFailure(m) && 'text-status-failed')}>{m.host}</span>
                    </span>
                  ))}
                </span>
              </td>
              <td className="px-3 py-1 text-right align-middle whitespace-nowrap">
                {single ? <Duration mission={single} /> : fmtDuration(r.durationMs)}
              </td>
              <td className="px-3 py-1 text-right align-middle whitespace-nowrap text-muted-foreground">
                <Ago ms={r.timeCreated} />
              </td>
              <td className="py-0 pr-4 pl-3 align-middle">
                {single && (
                  <div className="relative z-10">
                    <MissionRowActions mission={single} />
                  </div>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
