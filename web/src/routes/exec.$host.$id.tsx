import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Download } from 'lucide-react'
import { useExec } from '@/hooks/useExec'
import { PageHeader } from '@/components/PageHeader'
import { BackButton } from '@/components/BackButton'
import { StatusBadge } from '@/components/StatusBadge'
import { HostChip } from '@/components/HostChip'
import { Duration } from '@/components/Duration'
import { CopyButton } from '@/components/CopyButton'
import { JsonView } from '@/components/JsonView'
import { ErrorState } from '@/components/ErrorState'
import { LogPane } from '@/components/LogPane'
import { EventTimeline } from '@/components/EventTimeline'
import { MissionRowActions } from '@/components/MissionRowActions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtTime } from '@/lib/format'
import type { ExecDetail } from '@/lib/types'

export const Route = createFileRoute('/exec/$host/$id')({ component: ExecDetailScreen })

function ExecDetailScreen() {
  const { host, id } = Route.useParams()
  const navigate = useNavigate()
  const { data: m, isLoading, isError, error, refetch } = useExec(host, id)

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Exec">
        <BackButton
          fallback={
            <Link
              to="/exec"
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Exec
            </Link>
          }
        />
      </PageHeader>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading || !m ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-16 rounded-md" />
          <Skeleton className="h-9 w-72 rounded-md" />
          <Skeleton className="h-64 rounded-md" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start gap-3 border-b px-4 py-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <StatusBadge mission={m} />
                <HostChip host={m.host} />
                {m.group_id && (
                  <Link
                    to="/exec/groups/$groupId"
                    params={{ groupId: m.group_id }}
                    className="rounded border px-1.5 py-0.5 font-mono text-[11px] text-primary hover:underline"
                  >
                    group {m.group_id.slice(0, 8)}…
                  </Link>
                )}
              </div>
              <h2 className="truncate font-mono text-[14px] font-semibold">
                {m.display_name || m.mission_id}
              </h2>
              <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
                <span className="font-mono">{m.mission_id}</span>
                <CopyButton value={m.mission_id} label="Copy exec id" />
                <span className="px-1">·</span>
                <span>
                  exit{' '}
                  <span className="font-mono">
                    {m.exit_code != null ? m.exit_code : m.signal ? `sig ${m.signal}` : '—'}
                  </span>
                </span>
                <span className="px-1">·</span>
                <Duration mission={m} />
                <span className="px-1">·</span>
                <span>{fmtTime(m.time_finished || m.time_started)}</span>
              </div>
            </div>
            <MissionRowActions
              mission={m}
              onRestarted={(newId) => navigate({ to: '/exec/$host/$id', params: { host, id: newId } })}
            />
          </div>

          <Tabs defaultValue="output" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-4 mt-2 w-fit">
              <TabsTrigger value="output">Output</TabsTrigger>
              <TabsTrigger value="script">Script</TabsTrigger>
              <TabsTrigger value="events">Events</TabsTrigger>
              <TabsTrigger value="input">Input</TabsTrigger>
              <TabsTrigger value="result">Result</TabsTrigger>
            </TabsList>
            <TabsContent value="output" className="min-h-0 flex-1 border-t">
              <LogPane
                host={host}
                id={id}
                status={m.status}
                truncatedStdout={m.truncated_stdout}
                truncatedStderr={m.truncated_stderr}
              />
            </TabsContent>
            <TabsContent value="script" className="min-h-0 flex-1 overflow-auto border-t p-4">
              <ScriptPane m={m} host={host} />
            </TabsContent>
            <TabsContent value="events" className="min-h-0 flex-1 overflow-auto border-t">
              <EventTimeline host={host} id={id} enabled />
            </TabsContent>
            <TabsContent value="input" className="min-h-0 flex-1 overflow-auto border-t p-4">
              <JsonView json={m.input} />
            </TabsContent>
            <TabsContent value="result" className="min-h-0 flex-1 overflow-auto border-t p-4">
              <JsonView json={m.return} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  )
}

function ScriptPane({ m, host }: { m: ExecDetail; host: string }) {
  if (!m.script_preview && !m.script_staging_id) {
    return <p className="text-[12px] text-muted-foreground">No script — this exec ran an inline command.</p>
  }
  return (
    <div className="space-y-2">
      {m.script_staging_id && (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span>{m.script_truncated ? 'script preview — first 4 KiB' : 'script'}</span>
          <a
            href={`/api/staging/${encodeURIComponent(host)}/${encodeURIComponent(m.script_staging_id)}`}
            className="ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent"
          >
            <Download className="size-3.5" />
            Download full
          </a>
        </div>
      )}
      <pre className="overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words">
        {m.script_preview || '(empty)'}
      </pre>
    </div>
  )
}
