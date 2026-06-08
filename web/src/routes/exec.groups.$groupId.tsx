import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useExecGroup } from '@/hooks/useExecGroup'
import { PageHeader } from '@/components/PageHeader'
import { UnavailableHostsBanner } from '@/components/UnavailableHostsBanner'
import { ExecTable } from '@/components/ExecTable'
import { ErrorState } from '@/components/ErrorState'
import { EmptyState } from '@/components/EmptyState'
import { CopyButton } from '@/components/CopyButton'
import { Skeleton } from '@/components/ui/skeleton'
import type { ExecGroupSummary } from '@/lib/types'

export const Route = createFileRoute('/exec/groups/$groupId')({ component: ExecGroupScreen })

function ExecGroupScreen() {
  const { groupId } = Route.useParams()
  const { data, isLoading, isError, error, refetch } = useExecGroup(groupId)

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Exec group">
        <span className="font-mono text-[12px] text-muted-foreground">{groupId.slice(0, 12)}…</span>
        <CopyButton value={groupId} label="Copy group id" />
        <Link
          to="/exec"
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Exec
        </Link>
      </PageHeader>
      <UnavailableHostsBanner hosts={data?.unavailable_hosts} reasons={data?.unavailable_reasons} />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-16 rounded-md" />
          <Skeleton className="h-48 rounded-md" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <SummaryStrip s={data.summary} />
          <div className="flex-1 overflow-auto">
            {(data.items ?? []).length === 0 ? (
              <EmptyState title="No members" hint="This group has no exec missions on the reachable hosts." />
            ) : (
              <ExecTable rows={data.items ?? []} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryStrip({ s }: { s: ExecGroupSummary }) {
  const stats: Array<[string, number, string]> = [
    ['total', s.total, ''],
    ['success', s.success, 'text-status-success'],
    ['failed', s.failed, 'text-status-failed'],
    ['running', s.running, 'text-status-running'],
    ['queued', s.queued, 'text-status-queued'],
  ]
  return (
    <div className="flex gap-8 border-b px-4 py-3">
      {stats.map(([label, value, tone]) => (
        <div key={label} className="flex flex-col">
          <span className={`font-mono text-xl tabular leading-none ${tone}`}>{value}</span>
          <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  )
}
