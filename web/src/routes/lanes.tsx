import { createFileRoute } from '@tanstack/react-router'
import { useLanes } from '@/hooks/useLanes'
import { PageHeader } from '@/components/PageHeader'
import { UnavailableHostsBanner } from '@/components/UnavailableHostsBanner'
import { ErrorState } from '@/components/ErrorState'
import { EmptyState } from '@/components/EmptyState'
import { HostChip } from '@/components/HostChip'
import { LaneChip } from '@/components/LaneChip'
import { LaneToggle } from '@/components/LaneToggle'
import { DTable, DThead, DTh, DTr, DTd, SortableDTh } from '@/components/Table'
import { Skeleton } from '@/components/ui/skeleton'
import { useTableSort } from '@/hooks/useTableSort'
import type { LaneStatus } from '@/lib/types'

export const Route = createFileRoute('/lanes')({ component: Lanes })

const sortAccessors: Record<string, (l: LaneStatus) => unknown> = {
  host: (l) => l.host,
  lane: (l) => l.name,
  queued: (l) => l.queued,
  running: (l) => l.running,
  concurrency: (l) => l.concurrency,
  state: (l) => l.paused,
}

function Lanes() {
  const { data, isLoading, isError, error, refetch } = useLanes()
  const lanes = data?.lanes ?? []
  const { sort, toggle, sorted } = useTableSort(sortAccessors, { key: 'host', dir: 'asc' })
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Lanes" count={lanes.length} />
      <UnavailableHostsBanner hosts={data?.unavailable_hosts} reasons={data?.unavailable_reasons} />
      <div className="flex-1 overflow-auto">
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 rounded" />
            ))}
          </div>
        ) : lanes.length === 0 ? (
          <EmptyState title="No lanes" />
        ) : (
          <DTable>
            <DThead>
              <tr>
                <SortableDTh sortKey="host" sort={sort} onToggle={toggle}>Host</SortableDTh>
                <SortableDTh sortKey="lane" sort={sort} onToggle={toggle}>Lane</SortableDTh>
                <SortableDTh sortKey="queued" sort={sort} onToggle={toggle} className="text-right">Queued</SortableDTh>
                <SortableDTh sortKey="running" sort={sort} onToggle={toggle} className="text-right">Running</SortableDTh>
                <SortableDTh sortKey="concurrency" sort={sort} onToggle={toggle} className="text-right">Concurrency</SortableDTh>
                <SortableDTh sortKey="state" sort={sort} onToggle={toggle}>State</SortableDTh>
                <DTh className="text-right">Action</DTh>
              </tr>
            </DThead>
            <tbody>
              {sorted(lanes).map((l) => (
                <DTr key={`${l.host}/${l.name}`} className={l.paused ? 'bg-status-warn/5' : undefined}>
                  <DTd>
                    <HostChip host={l.host} />
                  </DTd>
                  <DTd>
                    <LaneChip lane={l.name} />
                  </DTd>
                  <DTd className="text-right font-mono tabular">{l.queued}</DTd>
                  <DTd className="text-right font-mono tabular text-status-running">{l.running || ''}</DTd>
                  <DTd className="text-right font-mono tabular text-muted-foreground">{l.concurrency}</DTd>
                  <DTd>
                    {l.paused ? (
                      <span className="rounded border border-status-warn/30 bg-status-warn/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-status-warn">
                        paused
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">active</span>
                    )}
                  </DTd>
                  <DTd className="text-right">
                    <LaneToggle host={l.host} lane={l.name} paused={l.paused} />
                  </DTd>
                </DTr>
              ))}
            </tbody>
          </DTable>
        )}
      </div>
    </div>
  )
}
