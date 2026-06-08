import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Loader2, Pause, Play } from 'lucide-react'
import { useLanes } from '@/hooks/useLanes'
import { useLaneActions } from '@/hooks/useLaneActions'
import { PageHeader } from '@/components/PageHeader'
import { UnavailableHostsBanner } from '@/components/UnavailableHostsBanner'
import { ErrorState } from '@/components/ErrorState'
import { EmptyState } from '@/components/EmptyState'
import { HostChip } from '@/components/HostChip'
import { LaneChip } from '@/components/LaneChip'
import { DTable, DThead, DTh, DTr, DTd } from '@/components/Table'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/api'

export const Route = createFileRoute('/lanes')({ component: Lanes })

function Lanes() {
  const { data, isLoading, isError, error, refetch } = useLanes()
  const lanes = data?.lanes ?? []
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
                <DTh>Host</DTh>
                <DTh>Lane</DTh>
                <DTh className="text-right">Queued</DTh>
                <DTh className="text-right">Running</DTh>
                <DTh className="text-right">Concurrency</DTh>
                <DTh>State</DTh>
                <DTh className="text-right">Action</DTh>
              </tr>
            </DThead>
            <tbody>
              {lanes.map((l) => (
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

function LaneToggle({ host, lane, paused }: { host: string; lane: string; paused: boolean }) {
  const { pause, cont } = useLaneActions()
  const pending = pause.isPending || cont.isPending
  const onClick = () => {
    const action = paused ? cont : pause
    action.mutate(
      { host, lane },
      {
        onSuccess: () => toast.success(paused ? `Resumed ${lane}` : `Paused ${lane}`),
        onError: (e) => toast.error('Lane action failed', { description: errorMessage(e) }),
      },
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex h-7 w-[92px] items-center justify-center gap-1 rounded-md border px-2 text-[12px] transition-colors hover:bg-accent disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : paused ? (
        <Play className="size-3" />
      ) : (
        <Pause className="size-3" />
      )}
      {paused ? 'Continue' : 'Pause'}
    </button>
  )
}
