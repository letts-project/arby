import type { ReactNode } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, ChevronRight, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { useConfig } from '@/hooks/useConfig'
import { useDugdales } from '@/hooks/useDugdales'
import { useLanes } from '@/hooks/useLanes'
import { useMissions } from '@/hooks/useMissions'
import { useTableSort } from '@/hooks/useTableSort'
import { PageHeader } from '@/components/PageHeader'
import { BackButton } from '@/components/BackButton'
import { ErrorState } from '@/components/ErrorState'
import { EmptyState } from '@/components/EmptyState'
import { JsonView } from '@/components/JsonView'
import { HostChip } from '@/components/HostChip'
import { LaneChip } from '@/components/LaneChip'
import { LaneToggle } from '@/components/LaneToggle'
import { StatusBadge } from '@/components/StatusBadge'
import { Duration } from '@/components/Duration'
import { DTable, DThead, DTh, DTr, DTd, SortableDTh } from '@/components/Table'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtAgo, fmtDuration } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { HostStatus, LaneStatus, MergedMission } from '@/lib/types'

export const Route = createFileRoute('/config/$host')({ component: HostDetail })

function HostDetail() {
  const { host } = Route.useParams()
  const { data, isLoading, isError, error, refetch } = useDugdales()
  const status = data?.hosts.find((h) => h.id === host)

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={host}>
        <HostChip host={host} />
        {status && (
          <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <span
              className={cn('size-2 rounded-full', status.online ? 'bg-status-success' : 'bg-status-failed')}
              aria-hidden
            />
            {status.online ? 'online' : 'offline'}
          </span>
        )}
        {status?.version && (
          <span className="font-mono text-[11px] text-muted-foreground">{status.version}</span>
        )}
        <BackButton
          fallback={
            <Link
              to="/dugdales"
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Dugdales
            </Link>
          }
        />
      </PageHeader>

      <div className="flex-1 overflow-auto p-4">
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <div className="flex flex-col gap-6">
            <Skeleton className="h-20 rounded-md" />
            <Skeleton className="h-48 rounded-md" />
          </div>
        ) : !status ? (
          <EmptyState title="Host not found" hint="Unknown or unmanaged dugdale — check letts.yaml." />
        ) : (
          <div className="flex flex-col gap-6">
            <StatusStrip status={status} />
            <Section title="Lanes">
              <HostLanes host={host} />
            </Section>
            <Section
              title="Recent missions"
              action={
                <Link
                  to="/missions"
                  search={{ host }}
                  className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline"
                >
                  View all
                  <ChevronRight className="size-3" />
                </Link>
              }
            >
              <RecentMissions host={host} online={status.online} />
            </Section>
            <RawConfig host={host} />
          </div>
        )}
      </div>
    </div>
  )
}

/** Bordered panel matching the dashboard's section style. */
function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-md border bg-card">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {children}
    </section>
  )
}

function StatusStrip({ status }: { status: HostStatus }) {
  const live = status.online && status.managed
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-card p-4">
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <Stat label="queued" value={live ? String(status.queue_summary.queued) : '—'} />
        <Stat label="running" value={live ? String(status.queue_summary.running) : '—'} accent />
        <Stat label="uptime" value={live ? fmtDuration((status.uptime_seconds ?? 0) * 1000) : '—'} />
        <Stat label="applied" value={live ? fmtAgo(status.applied_at ?? undefined) : '—'} />
      </div>
      {status.labels && status.labels.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-t pt-3">
          <span className="mr-1 text-[10px] uppercase tracking-wide text-muted-foreground">labels</span>
          {Array.from(new Set(status.labels)).map((l) => (
            <span key={l} className="rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className={cn('font-mono text-2xl tabular leading-none', accent && 'text-status-running')}>
        {value}
      </span>
      <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  )
}

const laneSort: Record<string, (l: LaneStatus) => unknown> = {
  lane: (l) => l.name,
  queued: (l) => l.queued,
  running: (l) => l.running,
  concurrency: (l) => l.concurrency,
  state: (l) => l.paused,
}

function HostLanes({ host }: { host: string }) {
  const { data, isLoading } = useLanes()
  const lanes = (data?.lanes ?? []).filter((l) => l.host === host)
  const { sort, toggle, sorted } = useTableSort(laneSort, { key: 'lane', dir: 'asc' })

  if (isLoading) return <div className="p-4"><Skeleton className="h-24 rounded" /></div>
  if (lanes.length === 0) return <EmptyState title="No lanes" />

  return (
    <DTable>
      <DThead>
        <tr>
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
          <DTr key={l.name} className={l.paused ? 'bg-status-warn/5' : undefined}>
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
              <LaneToggle host={host} lane={l.name} paused={l.paused} />
            </DTd>
          </DTr>
        ))}
      </tbody>
    </DTable>
  )
}

/** Last few missions on this host (recent-first). A preview — full, paginated
 *  list lives behind "View all". Not sortable (it's a slice of a server-paged
 *  resource, like the Missions page itself). */
function RecentMissions({ host, online }: { host: string; online: boolean }) {
  const { data, isLoading } = useMissions({ host, limit: 8 })
  const rows = data?.items ?? []

  if (isLoading) return <div className="p-4"><Skeleton className="h-24 rounded" /></div>
  if (rows.length === 0) {
    return <EmptyState title="No missions" hint={online ? undefined : 'Host is offline.'} />
  }

  return (
    <DTable>
      <DThead>
        <tr>
          <DTh>Status</DTh>
          <DTh>Mission</DTh>
          <DTh>Lane</DTh>
          <DTh>Duration</DTh>
          <DTh>Created</DTh>
        </tr>
      </DThead>
      <tbody>
        {rows.map((m: MergedMission) => (
          <DTr key={m.mission_id} className="cursor-pointer">
            <DTd>
              <MissionLink m={m}>
                <StatusBadge mission={m} />
              </MissionLink>
            </DTd>
            <DTd className="max-w-[18rem] truncate">
              <MissionLink m={m}>{m.mission_name || m.display_name || m.mission_id}</MissionLink>
            </DTd>
            <DTd>{m.lane ? <LaneChip lane={m.lane} /> : <span className="text-muted-foreground">—</span>}</DTd>
            <DTd>
              <Duration mission={m} />
            </DTd>
            <DTd className="whitespace-nowrap text-muted-foreground">{fmtAgo(m.time_created)}</DTd>
          </DTr>
        ))}
      </tbody>
    </DTable>
  )
}

function MissionLink({ m, children }: { m: MergedMission; children: ReactNode }) {
  return (
    <Link to="/missions/$host/$id" params={{ host: m.host, id: m.mission_id }} className="block hover:text-primary">
      {children}
    </Link>
  )
}

/** The applied config, tucked into a collapsible block — still available, no
 *  longer the whole page. */
function RawConfig({ host }: { host: string }) {
  const { data, isLoading, isError, error, refetch } = useConfig(host)
  return (
    <details className="overflow-hidden rounded-md border bg-card">
      <summary className="flex cursor-pointer items-center gap-2 bg-muted/30 px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        Applied config
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            void navigator.clipboard?.writeText(JSON.stringify(data, null, 2))
            toast.success('Config copied')
          }}
          disabled={!data}
          className="ml-auto inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] normal-case text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <Copy className="size-3" />
          Copy
        </button>
      </summary>
      <div className="p-4">
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <Skeleton className="h-48 rounded-md" />
        ) : (
          <JsonView json={data} />
        )}
      </div>
    </details>
  )
}
