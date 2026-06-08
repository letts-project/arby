import { createFileRoute, Link } from '@tanstack/react-router'
import { Server } from 'lucide-react'
import { useDashboard } from '@/hooks/useDashboard'
import { PageHeader } from '@/components/PageHeader'
import { UnavailableHostsBanner } from '@/components/UnavailableHostsBanner'
import { ErrorState } from '@/components/ErrorState'
import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'
import { HostChip } from '@/components/HostChip'
import { LaneChip } from '@/components/LaneChip'
import { DTable, DThead, DTh, DTr, DTd } from '@/components/Table'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtAgo, fmtDuration } from '@/lib/format'
import type { HostStatus, LaneStatus, MergedMission } from '@/lib/types'

export const Route = createFileRoute('/')({ component: Dashboard })

function Dashboard() {
  const { data, isLoading, isError, error, refetch } = useDashboard()

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Dashboard" />
      <UnavailableHostsBanner hosts={data?.unavailable_hosts} reasons={data?.unavailable_reasons} />
      <div className="flex-1 overflow-auto p-4">
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <DashboardSkeleton />
        ) : !data ? null : (
          <div className="flex flex-col gap-6">
            <HostStrip hosts={data.hosts ?? []} />
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Queues by lane" count={(data.lanes ?? []).length}>
                <LanesSummary lanes={data.lanes ?? []} />
              </Panel>
              <Panel title="Recent failures" count={(data.recent_failures ?? []).length}>
                <RecentFailures rows={data.recent_failures ?? []} />
              </Panel>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Panel({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-md border bg-card">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {count != null && <span className="font-mono text-[11px] tabular text-muted-foreground">{count}</span>}
      </div>
      {children}
    </section>
  )
}

function HostStrip({ hosts }: { hosts: HostStatus[] }) {
  if (hosts.length === 0) {
    return (
      <div className="rounded-md border bg-card">
        <EmptyState title="No dugdales configured" hint="Check letts.yaml" icon={<Server className="size-6" />} />
      </div>
    )
  }
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(208px,1fr))]">
      {hosts.map((h) => (
        <HostCard key={h.id} host={h} />
      ))}
    </div>
  )
}

function HostCard({ host }: { host: HostStatus }) {
  const body = (
    <>
      <div className="flex items-center gap-2">
        <span
          className={
            'size-2 rounded-full ' + (host.online ? 'bg-status-success' : 'bg-status-failed')
          }
          aria-hidden
        />
        <span className="font-mono text-[13px] font-semibold">{host.id}</span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{host.version ?? '—'}</span>
      </div>
      {!host.managed ? (
        <span
          className="py-2 text-[12px] font-medium text-muted-foreground"
          title="No admin token for this host — arby shows health/version only; it is excluded from listings and actions."
        >
          {host.online ? 'unmanaged' : 'offline · unmanaged'}
        </span>
      ) : host.online ? (
        <>
          <div className="flex gap-4">
            <Stat label="queued" value={host.queue_summary.queued} />
            <Stat label="running" value={host.queue_summary.running} accent />
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>up {fmtDuration((host.uptime_seconds ?? 0) * 1000)}</span>
            <span>applied {fmtAgo(host.applied_at ?? undefined)}</span>
          </div>
        </>
      ) : (
        <span className="py-2 text-[12px] font-medium text-status-failed">offline</span>
      )}
    </>
  )
  // Config is an admin endpoint — only managed hosts can link to it.
  if (!host.managed) {
    return <div className="flex flex-col gap-2.5 rounded-md border bg-card p-3">{body}</div>
  }
  return (
    <Link
      to="/config/$host"
      params={{ host: host.id }}
      className="group flex flex-col gap-2.5 rounded-md border bg-card p-3 transition-colors hover:border-border-strong"
    >
      {body}
    </Link>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className={'font-mono text-xl tabular leading-none ' + (accent ? 'text-status-running' : '')}>
        {value}
      </span>
      <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  )
}

function LanesSummary({ lanes }: { lanes: LaneStatus[] }) {
  if (lanes.length === 0) return <EmptyState title="No lanes" />
  return (
    <DTable>
      <DThead>
        <tr>
          <DTh>Host</DTh>
          <DTh>Lane</DTh>
          <DTh className="text-right">Queued</DTh>
          <DTh className="text-right">Running</DTh>
          <DTh className="text-right">Conc.</DTh>
          <DTh></DTh>
        </tr>
      </DThead>
      <tbody>
        {lanes.map((l) => (
          <DTr key={`${l.host}/${l.name}`}>
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
              {l.paused && (
                <span className="rounded border border-status-warn/30 bg-status-warn/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-status-warn">
                  paused
                </span>
              )}
            </DTd>
          </DTr>
        ))}
      </tbody>
    </DTable>
  )
}

function RecentFailures({ rows }: { rows: MergedMission[] }) {
  if (rows.length === 0) return <EmptyState title="No recent failures" hint="The cluster is healthy." />
  return (
    <DTable>
      <DThead>
        <tr>
          <DTh>Outcome</DTh>
          <DTh>Mission</DTh>
          <DTh>Host</DTh>
          <DTh>Finished</DTh>
          <DTh>Reason</DTh>
        </tr>
      </DThead>
      <tbody>
        {rows.map((m) => (
          <DTr key={`${m.host}/${m.mission_id}`} className="cursor-pointer">
            <DTd>
              <FailureLink m={m}>
                <StatusBadge mission={m} />
              </FailureLink>
            </DTd>
            <DTd className="max-w-[16rem] truncate">
              <FailureLink m={m}>{m.mission_name || m.display_name || m.mission_id}</FailureLink>
            </DTd>
            <DTd>
              <HostChip host={m.host} />
            </DTd>
            <DTd className="whitespace-nowrap text-muted-foreground">{fmtAgo(m.time_finished)}</DTd>
            <DTd className="max-w-[12rem] truncate font-mono text-[11px] text-muted-foreground">
              {m.fail_reason || '—'}
            </DTd>
          </DTr>
        ))}
      </tbody>
    </DTable>
  )
}

function FailureLink({ m, children }: { m: MergedMission; children: React.ReactNode }) {
  return (
    <Link to="/missions/$host/$id" params={{ host: m.host, id: m.mission_id }} className="block hover:text-primary">
      {children}
    </Link>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(208px,1fr))]">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-md" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-md" />
        <Skeleton className="h-64 rounded-md" />
      </div>
    </div>
  )
}
