import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { useConfig } from '@/hooks/useConfig'
import { useDugdales } from '@/hooks/useDugdales'
import { useLanes } from '@/hooks/useLanes'
import { useMissions } from '@/hooks/useMissions'
import { HostLine, QueuesTable } from '@/components/QueuesTable'
import { MissionsTable } from '@/components/MissionsTable'
import { ErrorState } from '@/components/ErrorState'
import { EmptyState } from '@/components/EmptyState'
import { JsonView } from '@/components/JsonView'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/dugdales/$host')({ component: HostDetail })

function HostDetail() {
  const { host } = Route.useParams()
  const { data, isLoading, isError, error, refetch } = useDugdales()
  const { data: lanesData } = useLanes()
  const status = data?.hosts.find((h) => h.id === host)
  const lanes = (lanesData?.lanes ?? []).filter((l) => l.host === host)

  return (
    <div className="px-5 pt-3 pb-10">
      <Link to="/dugdales" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Dugdales
      </Link>
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Skeleton className="mt-3 h-64 rounded" />
      ) : !status ? (
        <EmptyState title={`No dugdale called ${host}`} hint="arby lists the dugdales from letts.yaml." />
      ) : (
        <>
          <h1 className="mt-2 text-[19px] font-semibold">{host}</h1>
          <div className="mt-0.5">
            <HostLine host={status} reason={data?.unavailable_reasons?.[host]} named={false} detailed />
          </div>
          <div className="mt-6 grid gap-x-10 gap-y-8 xl:grid-cols-[minmax(0,1fr)_480px]">
            <section className="min-w-0">
              <div className="mb-1 flex items-baseline gap-2">
                <h2 className="text-[14px] font-semibold">Recent missions</h2>
                <Link to="/missions" search={{ host }} className="ml-auto text-muted-foreground hover:text-foreground">
                  All missions on {host}
                </Link>
              </div>
              <RecentMissions host={host} online={status.online} />
            </section>
            <section>
              <h2 className="mb-1 text-[14px] font-semibold">Lanes</h2>
              {status.online ? (
                <QueuesTable hosts={[status]} lanes={lanes} hostHeaders={false} />
              ) : (
                <p className="text-muted-foreground">Unknown while the dugdale is unreachable.</p>
              )}
            </section>
          </div>
          {status.managed && <AppliedConfig host={host} />}
        </>
      )}
    </div>
  )
}

function RecentMissions({ host, online }: { host: string; online: boolean }) {
  const { data, isLoading } = useMissions({ host, limit: 15 })
  if (isLoading) return <Skeleton className="h-32 rounded" />
  const rows = data?.items ?? []
  if (rows.length === 0) return <p className="py-2 text-muted-foreground">{online ? 'No missions yet.' : 'Unreachable.'}</p>
  return <MissionsTable rows={rows} embedded />
}

function AppliedConfig({ host }: { host: string }) {
  const { data, isLoading, isError, error, refetch } = useConfig(host)
  return (
    <details className="group mt-8">
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <h2 className="text-[14px] font-semibold">
          <span className="inline-block w-3 text-muted-foreground group-open:rotate-90">›</span>
          Applied config
        </h2>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            void navigator.clipboard?.writeText(JSON.stringify(data, null, 2))
            toast.success('Config copied')
          }}
          disabled={!data}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <Copy className="size-3.5" />
          Copy JSON
        </button>
      </summary>
      <div className="mt-2 max-w-5xl">
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <Skeleton className="h-48 rounded" />
        ) : (
          <JsonView json={data} />
        )}
      </div>
    </details>
  )
}
