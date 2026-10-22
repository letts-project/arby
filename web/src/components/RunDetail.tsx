import { useEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useCanGoBack, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Download } from 'lucide-react'
import { useEventStream } from '@/hooks/useEventStream'
import { StatusBadge } from './StatusBadge'
import { Where } from './Where'
import { Duration } from './Duration'
import { Ago } from './Ago'
import { CopyButton } from './CopyButton'
import { JsonView } from './JsonView'
import { LogPane } from './LogPane'
import { EventTimeline } from './EventTimeline'
import { MissionRowActions } from './MissionRowActions'
import { Tip } from './Tip'
import { fmtBytes, fmtDuration, fmtTime } from '@/lib/format'
import { failureText, isFailure, missionTitle } from '@/lib/missionView'
import { cn } from '@/lib/utils'
import type { MergedMission, MissionFile } from '@/lib/types'

/**
 * The detail screen shared by missions and exec runs: what it is and what
 * happened (status, failure, progress, actions) on top, the output as the main
 * pane, and the facts (timing, input, return, files, events) beside it.
 */
export function RunDetail({
  m,
  back,
  onRestarted,
  title,
  extra,
}: {
  m: MergedMission
  back: ReactNode
  onRestarted: (newId: string) => void
  title?: ReactNode
  extra?: ReactNode
}) {
  const events = useEventStream(m.host, m.mission_id, true)
  const qc = useQueryClient()
  const finished = !!events.done
  useEffect(() => {
    if (!finished) return
    qc.invalidateQueries({ queryKey: ['mission', m.host, m.mission_id] })
    qc.invalidateQueries({ queryKey: ['exec', m.host, m.mission_id] })
  }, [finished, qc, m.host, m.mission_id])
  const progress = m.status === 'running' ? events.latestProgress : undefined
  const pct = progress?.value != null ? Math.max(0, Math.min(100, Math.round(progress.value * 100))) : null

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b px-5 pt-3 pb-4">
        <div className="mb-2">{back}</div>
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-3">
              <StatusBadge mission={m} className="text-[14px]" />
              <h1 className="min-w-0 truncate text-[19px] font-semibold">{title ?? missionTitle(m)}</h1>
            </div>
            <MetaLine m={m} />
          </div>
          <MissionRowActions mission={m} layout="page" onRestarted={onRestarted} />
        </div>
        {pct != null && (
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 max-w-xl flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-status-running transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="font-medium">{pct}%</span>
            {progress?.message && <span className="truncate text-muted-foreground">{progress.message}</span>}
          </div>
        )}
        {isFailure(m) && <FailureNote m={m} />}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,30%)]">
        <LogPane
          host={m.host}
          id={m.mission_id}
          status={m.status}
          truncatedStdout={m.truncated_stdout}
          truncatedStderr={m.truncated_stderr}
          className="min-h-[320px]"
        />
        <aside className="min-h-0 overflow-auto border-t px-5 py-4 lg:border-t-0 lg:border-l">
          <Facts m={m} />
          {extra}
          <Section title="Input">
            <JsonView json={m.input} empty="No input." />
          </Section>
          {m.status === 'done' && (
            <Section title="Return">
              <JsonView json={m.return} empty="Nothing returned." />
            </Section>
          )}
          <Files m={m} />
          <Section title="Events">
            <EventTimeline stream={events} />
          </Section>
        </aside>
      </div>
    </div>
  )
}

/** Back to wherever the user came from (keeping that list's filters), or to
 *  the section list on a fresh tab. */
export function BackLink({ to, label }: { to: '/missions' | '/exec'; label: string }) {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const cls = 'inline-flex items-center gap-1 text-muted-foreground hover:text-foreground'
  if (canGoBack) {
    return (
      <button type="button" onClick={() => router.history.back()} className={cls}>
        <ArrowLeft className="size-3.5" />
        Back
      </button>
    )
  }
  return (
    <Link to={to} className={cls}>
      <ArrowLeft className="size-3.5" />
      {label}
    </Link>
  )
}

function MetaLine({ m }: { m: MergedMission }) {
  const parts: ReactNode[] = [
    <span key="where">
      on <Where host={m.host} lane={m.lane} className="font-medium" />
    </span>,
  ]
  if (m.status === 'queued') {
    parts.push(
      <span key="q">
        queued <Ago ms={m.time_created} />, <Duration mission={m} />
      </span>,
    )
  } else if (m.status === 'running') {
    parts.push(
      <span key="r">
        started <Ago ms={m.time_started} />, running for <Duration mission={m} />
      </span>,
    )
  } else if (m.time_finished) {
    parts.push(
      <span key="f">
        finished <Ago ms={m.time_finished} /> after {fmtDuration(m.duration_ms)}
      </span>,
    )
  }
  if (m.time_started && m.time_created && m.time_started - m.time_created >= 1000) {
    parts.push(<span key="w">waited {fmtDuration(m.time_started - m.time_created)} in the queue</span>)
  }
  if (m.exit_code != null && m.exit_code >= 0) parts.push(<span key="e">exit code {m.exit_code}</span>)
  if (m.signal) parts.push(<span key="s">signal {m.signal}</span>)
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-muted-foreground">
      {parts}
      <span className="inline-flex items-center gap-1">
        <span className="font-mono text-[12px]">{m.mission_id}</span>
        <CopyButton value={m.mission_id} label="Copy mission id" />
      </span>
      {m.restarted_from && (
        <span>
          restart of{' '}
          <Link
            to={m.kind === 'exec' ? '/exec/$host/$id' : '/missions/$host/$id'}
            params={{ host: m.host, id: m.restarted_from }}
            className="font-mono text-[12px] text-foreground underline underline-offset-2"
          >
            {m.restarted_from}
          </Link>
        </span>
      )}
    </div>
  )
}

function FailureNote({ m }: { m: MergedMission }) {
  const killed = m.outcome === 'killed'
  return (
    <div
      className={cn(
        'mt-3 max-w-4xl border-l-2 py-1 pl-3',
        killed ? 'border-status-warn' : 'border-status-failed',
      )}
    >
      <p className={cn('font-medium', killed ? 'text-status-warn' : 'text-status-failed')}>{failureText(m)}</p>
      {(m.fail_reason || m.fail_details != null) && (
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-4 text-muted-foreground">
          {m.fail_reason && <span className="font-mono text-[12px]">{m.fail_reason}</span>}
          {m.fail_details != null && (
            <span className="min-w-0 font-mono text-[12px] break-all">{JSON.stringify(m.fail_details)}</span>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      <h2 className="mb-1.5 font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Facts({ m }: { m: MergedMission }) {
  const rows: [string, ReactNode][] = [
    ['Created', fmtTime(m.time_created)],
    ['Started', fmtTime(m.time_started)],
    ['Finished', fmtTime(m.time_finished)],
    ['Timeout', m.timeout_ms ? fmtDuration(m.timeout_ms) : 'none'],
    ['PID', m.pid ?? '—'],
  ]
  return (
    <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Files({ m }: { m: MergedMission }) {
  const files: { kind: string; role: string; file: MissionFile }[] = [
    ...(m.inputs ?? []).map((f) => ({ kind: 'in', role: f.role ?? 'input', file: f })),
    ...Object.entries(m.outputs ?? {}).map(([role, file]) => ({ kind: 'out', role, file })),
  ]
  if (files.length === 0) return null
  return (
    <Section title="Files">
      <ul className="space-y-1">
        {files.map(({ kind, role, file }) => (
          <li key={`${kind}/${role}/${file.staging_id}`} className="flex items-center gap-2">
            <span className="w-7 text-muted-foreground">{kind}</span>
            <span className="min-w-0 flex-1 truncate font-medium" title={file.staging_id}>
              {role}
            </span>
            <span className="text-muted-foreground">{fmtBytes(file.size)}</span>
            <Tip label={`Download ${role}`}>
              <a
                href={`/api/staging/${encodeURIComponent(m.host)}/${encodeURIComponent(file.staging_id)}`}
                aria-label={`Download ${role}`}
                className="inline-grid size-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Download className="size-3.5" />
              </a>
            </Tip>
          </li>
        ))}
      </ul>
    </Section>
  )
}

export { Section as DetailSection }
