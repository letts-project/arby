import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Download } from 'lucide-react'
import { useExec } from '@/hooks/useExec'
import { RunDetail, BackLink, DetailSection } from '@/components/RunDetail'
import { ErrorState } from '@/components/ErrorState'
import { Skeleton } from '@/components/ui/skeleton'
import type { ExecDetail } from '@/lib/types'

export const Route = createFileRoute('/exec/$host/$id')({ component: ExecDetailScreen })

function ExecDetailScreen() {
  const { host, id } = Route.useParams()
  const navigate = useNavigate()
  const { data: m, isLoading, isError, error, refetch } = useExec(host, id)
  const back = <BackLink to="/exec" label="Exec" />

  if (isError) {
    return (
      <div className="pt-3">
        <div className="px-5">{back}</div>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    )
  }
  if (isLoading || !m) {
    return (
      <div className="space-y-3 px-5 pt-3">
        {back}
        <Skeleton className="h-8 w-80 rounded" />
        <Skeleton className="h-64 rounded" />
      </div>
    )
  }
  return (
    <RunDetail
      key={`${host}/${id}`}
      m={m}
      back={back}
      title={<span className="font-mono text-[17px]">{m.display_name || m.mission_id}</span>}
      onRestarted={(newId) => void navigate({ to: '/exec/$host/$id', params: { host, id: newId } })}
      extra={
        <>
          {m.group_id && (
            <DetailSection title="Group">
              <Link
                to="/exec/groups/$groupId"
                params={{ groupId: m.group_id }}
                className="underline underline-offset-2"
              >
                All hosts of this run
              </Link>
            </DetailSection>
          )}
          <Script m={m} host={host} />
        </>
      }
    />
  )
}

function Script({ m, host }: { m: ExecDetail; host: string }) {
  if (!m.script_preview && !m.script_staging_id) return null
  return (
    <DetailSection title="Script">
      {m.script_staging_id && (
        <div className="mb-1.5 flex items-center gap-2 text-muted-foreground">
          {m.script_truncated && <span>First 4 KiB shown.</span>}
          <a
            href={`/api/staging/${encodeURIComponent(host)}/${encodeURIComponent(m.script_staging_id)}`}
            className="ml-auto inline-flex items-center gap-1 hover:text-foreground"
          >
            <Download className="size-3.5" />
            Download
          </a>
        </div>
      )}
      <pre className="overflow-auto rounded-md bg-muted px-3 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words">
        {m.script_preview || '(empty)'}
      </pre>
    </DetailSection>
  )
}
