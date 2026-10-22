import { createFileRoute, Link } from '@tanstack/react-router'
import { useExecGroup } from '@/hooks/useExecGroup'
import { BackLink } from '@/components/RunDetail'
import { StatusBadge } from '@/components/StatusBadge'
import { Duration } from '@/components/Duration'
import { Ago } from '@/components/Ago'
import { OutputBlock } from '@/components/OutputBlock'
import { MissionRowActions } from '@/components/MissionRowActions'
import { UnavailableNote } from '@/components/UnavailableNote'
import { ErrorState } from '@/components/ErrorState'
import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { execCommand } from '@/lib/execGroups'
import { failureText, isFailure } from '@/lib/missionView'
import { sortBy } from '@/lib/sort'
import type { ExecGroupSummary } from '@/lib/types'

export const Route = createFileRoute('/exec/groups/$groupId')({ component: ExecGroupScreen })

function summaryText(s: ExecGroupSummary): string {
  const parts = [
    s.success && `${s.success} succeeded`,
    s.failed && `${s.failed} failed`,
    s.running && `${s.running} running`,
    s.queued && `${s.queued} queued`,
  ].filter(Boolean)
  return `${s.total} host${s.total === 1 ? '' : 's'}: ${parts.join(', ')}`
}

function ExecGroupScreen() {
  const { groupId } = Route.useParams()
  const { data, isLoading, isError, error, refetch } = useExecGroup(groupId)
  const items = sortBy(data?.items ?? [], (m) => m.host, 'asc')
  const command = items[0] ? execCommand(items[0]) : undefined

  return (
    <div className="px-5 pt-3 pb-10">
      <BackLink to="/exec" label="Exec" />
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <Skeleton className="mt-3 h-64 rounded" />
      ) : items.length === 0 ? (
        <EmptyState title="Nothing in this run." hint="None of the reachable dugdales has a command from this group." />
      ) : (
        <>
          <h1 className="mt-2 font-mono text-[17px] font-semibold">{command}</h1>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-5 text-muted-foreground">
            <span>{summaryText(data.summary)}</span>
            <span>
              started <Ago ms={Math.min(...items.map((m) => m.time_created ?? Infinity))} />
            </span>
            <span className="font-mono text-[12px]">group {groupId}</span>
            <UnavailableNote hosts={data.unavailable_hosts} reasons={data.unavailable_reasons} />
          </div>
          <div className="mt-6 max-w-6xl space-y-6">
            {items.map((m) => (
              <section key={`${m.host}/${m.mission_id}`}>
                <div className="mb-1.5 flex items-center gap-4">
                  <Link
                    to="/exec/$host/$id"
                    params={{ host: m.host, id: m.mission_id }}
                    className="text-[14px] font-semibold hover:underline"
                  >
                    {m.host}
                  </Link>
                  <StatusBadge mission={m} />
                  {m.exit_code != null && m.exit_code >= 0 && <span className="text-muted-foreground">exit code {m.exit_code}</span>}
                  <span className="text-muted-foreground">
                    <Duration mission={m} />
                  </span>
                  {isFailure(m) && (m.fail_message || m.fail_reason) && <span className="min-w-0 truncate">{failureText(m)}</span>}
                  <div className="ml-auto">
                    <MissionRowActions mission={m} />
                  </div>
                </div>
                <OutputBlock host={m.host} id={m.mission_id} status={m.status} />
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
