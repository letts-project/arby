import type { ReactNode } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import { useDashboard } from '@/hooks/useDashboard'
import { useMissions } from '@/hooks/useMissions'
import { MissionsTable } from '@/components/MissionsTable'
import { QueuesTable } from '@/components/QueuesTable'
import { LaneToggle } from '@/components/LaneToggle'
import { ErrorState } from '@/components/ErrorState'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { DashboardResult } from '@/lib/types'

export const Route = createFileRoute('/')({ component: Overview })

const RUNNING_LIMIT = 50

function Overview() {
  const { data, isLoading, isError, error, refetch } = useDashboard()
  const running = useMissions({ status: 'running', limit: RUNNING_LIMIT })
  const queues = data && <QueuesTable hosts={data.hosts} lanes={data.lanes} reasons={data.unavailable_reasons} />

  return (
    <div className="px-5 pt-4 pb-10">
      <h1 className="text-[17px] font-semibold">Overview</h1>
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <div className="mt-4 grid gap-8 xl:grid-cols-[minmax(0,1fr)_480px]">
          <Skeleton className="h-72 rounded" />
          <Skeleton className="h-72 rounded" />
        </div>
      ) : (
        <>
          <Attention data={data} />
          <div className="mt-5 grid gap-x-10 gap-y-8 xl:grid-cols-[minmax(0,1fr)_480px]">
            <div className="min-w-0 space-y-8">
              <Section
                title="Running now"
                count={running.data?.items.length}
                more={
                  running.data?.next_cursor ? (
                    <Link to="/missions" search={{ state: 'running' }} className="hover:text-foreground">
                      All running
                    </Link>
                  ) : undefined
                }
              >
                {running.isLoading ? (
                  <Skeleton className="h-24 rounded" />
                ) : (running.data?.items ?? []).length === 0 ? (
                  <p className="py-2 text-muted-foreground">Nothing is running.</p>
                ) : (
                  <MissionsTable rows={running.data?.items ?? []} embedded />
                )}
              </Section>
              <Section title="Queues" className="xl:hidden">
                {queues}
              </Section>
              <Section
                title="Recent failures"
                more={
                  <Link to="/missions" search={{ state: 'failed' }} className="hover:text-foreground">
                    All failures
                  </Link>
                }
              >
                {(data.recent_failures ?? []).length === 0 ? (
                  <p className="py-2 text-muted-foreground">No failures.</p>
                ) : (
                  <MissionsTable rows={data.recent_failures} timeBy="finished" embedded />
                )}
              </Section>
            </div>
            <Section title="Queues" className="hidden xl:block">
              {queues}
            </Section>
          </div>
        </>
      )}
    </div>
  )
}

function Section({
  title,
  count,
  more,
  className,
  children,
}: {
  title: string
  count?: number
  more?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cn('min-w-0', className)}>
      <div className="mb-1 flex items-baseline gap-2">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        {count != null && count > 0 && <span className="text-muted-foreground">{count}</span>}
        {more && <span className="ml-auto text-muted-foreground">{more}</span>}
      </div>
      {children}
    </section>
  )
}

/** Things an operator should act on: unreachable dugdales and paused lanes
 *  that are holding work back. */
function Attention({ data }: { data: DashboardResult }) {
  const down = data.hosts.filter((h) => !h.online)
  const stuck = data.lanes.filter((l) => l.paused && l.queued > 0)
  if (down.length === 0 && stuck.length === 0) return null
  return (
    <ul className="mt-3 divide-y rounded-md border border-status-warn/40 bg-status-warn/[0.06]">
      {down.map((h) => (
        <li key={h.id} className="flex items-baseline gap-2 px-3 py-2">
          <AlertTriangle className="size-3.5 shrink-0 self-center text-status-failed" />
          <span>
            <Link to="/dugdales/$host" params={{ host: h.id }} className="font-medium hover:underline">
              {h.id}
            </Link>{' '}
            is unreachable
          </span>
          {data.unavailable_reasons?.[h.id] && (
            <span className="min-w-0 truncate text-muted-foreground" title={data.unavailable_reasons[h.id]}>
              {data.unavailable_reasons[h.id]}
            </span>
          )}
        </li>
      ))}
      {stuck.map((l) => (
        <li key={`${l.host}/${l.name}`} className="flex items-center gap-2 px-3 py-1.5">
          <AlertTriangle className="size-3.5 shrink-0 text-status-warn" />
          <span>
            <span className="font-medium">
              {l.host}/{l.name}
            </span>{' '}
            is paused with{' '}
            <Link to="/missions" search={{ state: 'queued', host: l.host, lane: l.name }} className="underline underline-offset-2">
              {l.queued} waiting
            </Link>
          </span>
          <span className="ml-auto">
            <LaneToggle host={l.host} lane={l.name} paused />
          </span>
        </li>
      ))}
    </ul>
  )
}
