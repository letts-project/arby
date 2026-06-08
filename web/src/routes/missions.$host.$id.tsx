import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Download } from 'lucide-react'
import { useMission } from '@/hooks/useMission'
import { PageHeader } from '@/components/PageHeader'
import { BackButton } from '@/components/BackButton'
import { StatusBadge } from '@/components/StatusBadge'
import { HostChip } from '@/components/HostChip'
import { LaneChip } from '@/components/LaneChip'
import { Duration } from '@/components/Duration'
import { CopyButton } from '@/components/CopyButton'
import { JsonView } from '@/components/JsonView'
import { ErrorState } from '@/components/ErrorState'
import { LogPane } from '@/components/LogPane'
import { EventTimeline } from '@/components/EventTimeline'
import { MissionRowActions } from '@/components/MissionRowActions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtBytes, fmtTime } from '@/lib/format'
import type { MergedMission, MissionFile } from '@/lib/types'

export const Route = createFileRoute('/missions/$host/$id')({ component: MissionDetail })

function MissionDetail() {
  const { host, id } = Route.useParams()
  const navigate = useNavigate()
  const { data: m, isLoading, isError, error, refetch } = useMission(host, id)

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Mission">
        <BackButton
          fallback={
            <Link
              to="/missions"
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Missions
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
          <DetailHeader
            m={m}
            onRestarted={(newId) => navigate({ to: '/missions/$host/$id', params: { host, id: newId } })}
          />
          <MetaGrid m={m} />
          <Tabs defaultValue="output" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-4 mt-2 w-fit">
              <TabsTrigger value="output">Output</TabsTrigger>
              <TabsTrigger value="events">Events</TabsTrigger>
              <TabsTrigger value="input">Input</TabsTrigger>
              <TabsTrigger value="result">Result</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
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
            <TabsContent value="events" className="min-h-0 flex-1 overflow-auto border-t">
              <EventTimeline host={host} id={id} enabled />
            </TabsContent>
            <TabsContent value="input" className="min-h-0 flex-1 overflow-auto border-t p-4">
              <JsonView json={m.input} />
            </TabsContent>
            <TabsContent value="result" className="min-h-0 flex-1 overflow-auto border-t p-4">
              <ResultPane m={m} />
            </TabsContent>
            <TabsContent value="files" className="min-h-0 flex-1 overflow-auto border-t p-4">
              <FilesPane m={m} host={host} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  )
}

function DetailHeader({ m, onRestarted }: { m: MergedMission; onRestarted: (id: string) => void }) {
  return (
    <div className="flex items-start gap-3 border-b px-4 py-3">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <StatusBadge mission={m} />
          <HostChip host={m.host} />
          <LaneChip lane={m.lane} />
          {m.kind === 'exec' && (
            <span className="rounded border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">exec</span>
          )}
        </div>
        <h2 className="truncate text-[15px] font-semibold">
          {m.mission_name || m.display_name || m.mission_id}
        </h2>
        <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
          <span className="font-mono">{m.mission_id}</span>
          <CopyButton value={m.mission_id} label="Copy mission id" />
          {m.restarted_from && (
            <>
              <span className="px-1">·</span>
              <span>restarted from</span>
              <Link
                to="/missions/$host/$id"
                params={{ host: m.host, id: m.restarted_from }}
                className="font-mono text-primary hover:underline"
              >
                {m.restarted_from.slice(0, 8)}…
              </Link>
            </>
          )}
        </div>
      </div>
      <MissionRowActions mission={m} onRestarted={onRestarted} />
    </div>
  )
}

function MetaGrid({ m }: { m: MergedMission }) {
  const items: Array<[string, React.ReactNode]> = [
    ['Created', fmtTime(m.time_created)],
    ['Started', fmtTime(m.time_started)],
    ['Finished', fmtTime(m.time_finished)],
    ['Duration', <Duration mission={m} />],
    ['Exit', m.exit_code != null ? String(m.exit_code) : m.signal ? `sig ${m.signal}` : '—'],
    ['Timeout', m.timeout_ms ? `${Math.round(m.timeout_ms / 1000)}s` : '—'],
  ]
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-b px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map(([k, v]) => (
        <div key={k} className="flex flex-col">
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</dt>
          <dd className="font-mono text-[12px] tabular">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function ResultPane({ m }: { m: MergedMission }) {
  const failed = m.outcome && m.outcome !== 'success'
  return (
    <div className="space-y-4">
      {failed && (m.fail_reason || m.fail_message) && (
        <div className="rounded-md border border-status-failed/30 bg-status-failed/5 p-3">
          <div className="font-mono text-[12px] font-medium text-status-failed">{m.fail_reason || 'failed'}</div>
          {m.fail_message && <div className="mt-1 text-[12px] text-muted-foreground">{m.fail_message}</div>}
          {m.fail_details != null && <JsonView json={m.fail_details} className="mt-2" />}
        </div>
      )}
      <div>
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Return</h3>
        <JsonView json={m.return} />
      </div>
    </div>
  )
}

function FilesPane({ m, host }: { m: MergedMission; host: string }) {
  const inputs = m.inputs ?? []
  const outputs = Object.entries(m.outputs ?? {})
  if (inputs.length === 0 && outputs.length === 0) {
    return <p className="text-[12px] text-muted-foreground">No input or output files.</p>
  }
  return (
    <div className="space-y-5">
      {inputs.length > 0 && (
        <FileGroup title="Inputs" host={host} files={inputs.map((f) => ({ role: f.role ?? 'input', file: f }))} />
      )}
      {outputs.length > 0 && (
        <FileGroup title="Outputs" host={host} files={outputs.map(([role, file]) => ({ role, file }))} />
      )}
    </div>
  )
}

function FileGroup({
  title,
  host,
  files,
}: {
  title: string
  host: string
  files: Array<{ role: string; file: MissionFile }>
}) {
  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="overflow-hidden rounded-md border">
        {files.map(({ role, file }) => (
          <div key={`${role}/${file.staging_id}`} className="flex items-center gap-3 border-b px-3 py-2 last:border-0">
            <span className="w-24 shrink-0 font-mono text-[12px]">{role}</span>
            <span className="font-mono text-[11px] text-muted-foreground" title={file.staging_id}>
              {file.staging_id.slice(0, 10)}…
            </span>
            <CopyButton value={file.staging_id} label="Copy staging id" />
            <span className="ml-auto font-mono text-[11px] tabular text-muted-foreground">{fmtBytes(file.size)}</span>
            <a
              href={`/api/staging/${encodeURIComponent(host)}/${encodeURIComponent(file.staging_id)}`}
              className="inline-grid size-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Download"
            >
              <Download className="size-3.5" />
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
