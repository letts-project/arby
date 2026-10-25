import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useCanGoBack, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Check, ChevronRight, Copy, Download } from 'lucide-react'
import { useEventStream } from '@/hooks/useEventStream'
import { useOutputStream, type OutputStreamState } from '@/hooks/useOutputStream'
import { StatusBadge } from './StatusBadge'
import { Where } from './Where'
import { Duration } from './Duration'
import { Ago } from './Ago'
import { CopyButton } from './CopyButton'
import { JsonTree } from './JsonTree'
import { LogPane } from './LogPane'
import { EventTimeline } from './EventTimeline'
import { MissionProgress } from './MissionProgress'
import { MissionRowActions } from './MissionRowActions'
import { Tip } from './Tip'
import { fmtBytes, fmtDuration, fmtTime, lineCount } from '@/lib/format'
import { failureText, isFailure, missionTitle, reportedByMission } from '@/lib/missionView'
import { cn } from '@/lib/utils'
import type { MergedMission, MissionFile } from '@/lib/types'

/**
 * The detail screen shared by missions and exec runs: what it is and what
 * happened (status, failure, progress, actions) on top, the output, return and
 * input below it, and the facts (timing, files, events) beside them.
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
  const out = useOutputStream(m.host, m.mission_id, { enabled: true, terminal: m.status === 'done' })
  const qc = useQueryClient()
  const finished = !!events.done
  useEffect(() => {
    if (!finished) return
    qc.invalidateQueries({ queryKey: ['mission', m.host, m.mission_id] })
    qc.invalidateQueries({ queryKey: ['exec', m.host, m.mission_id] })
  }, [finished, qc, m.host, m.mission_id])
  const progress = events.events.filter((ev) => ev.event === 'progress')
  const [historyOpen, setHistoryOpen] = useState(false)

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
        <MissionProgress m={m} events={progress} historyOpen={historyOpen} onHistoryOpenChange={setHistoryOpen} />
        {isFailure(m) && <FailureNote m={m} />}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,24%)]">
        <RunBody m={m} out={out} />
        <aside className="min-h-0 overflow-auto border-t px-5 py-4 lg:border-t-0 lg:border-l">
          <Facts m={m} />
          {extra}
          <Files m={m} />
          <Section title="Events">
            <EventTimeline stream={events} onShowProgress={() => setHistoryOpen(true)} />
          </Section>
        </aside>
      </div>
    </div>
  )
}

function jsonSize(v: unknown): string {
  if (v == null) return 'none'
  return fmtBytes(new Blob([JSON.stringify(v)]).size)
}

function SectionToggle({
  open,
  onToggle,
  title,
  meta,
}: {
  open: boolean
  onToggle: () => void
  title: string
  meta?: string
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className="-ml-1.5 flex items-center gap-1.5 rounded-md py-1 pr-2 pl-1"
    >
      <ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-90')} />
      <span className="font-semibold">{title}</span>
      {meta && <span className="text-[12px] text-muted-foreground">{meta}</span>}
    </button>
  )
}

function JsonActions({ json, name }: { json: unknown; name: string }) {
  const [copied, setCopied] = useState(false)
  if (json == null) return null
  const text = JSON.stringify(json, null, 2)
  return (
    <div className="flex items-center gap-1 text-muted-foreground">
      <Tip label={copied ? 'Copied' : 'Copy JSON'}>
        <button
          type="button"
          aria-label={`Copy ${name}`}
          onClick={() => {
            void navigator.clipboard?.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
          className="inline-grid size-7 place-items-center rounded-md hover:bg-accent hover:text-foreground"
        >
          {copied ? <Check className="size-3.5 text-status-success" /> : <Copy className="size-3.5" />}
        </button>
      </Tip>
      <Tip label="Download JSON">
        <a
          aria-label={`Download ${name}`}
          href={`data:application/json;charset=utf-8,${encodeURIComponent(text)}`}
          download={`${name}.json`}
          className="inline-grid size-7 place-items-center rounded-md hover:bg-accent hover:text-foreground"
        >
          <Download className="size-3.5" />
        </a>
      </Tip>
    </div>
  )
}

/** Return or input as a foldable section; open by default when there is something. */
function DataSection({ title, json, empty, name }: { title: string; json: unknown; empty: string; name: string }) {
  const [chosen, setChosen] = useState<boolean | null>(null)
  const open = chosen ?? json != null
  return (
    <section className="border-b">
      <div
        onClick={() => setChosen(!open)}
        className="sticky top-0 z-10 flex h-10 cursor-pointer items-center gap-3 bg-background px-5 hover:bg-muted"
      >
        <SectionToggle open={open} onToggle={() => setChosen(!open)} title={title} meta={jsonSize(json)} />
        <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
          <JsonActions json={json} name={name} />
        </div>
      </div>
      {open && (
        <div className="px-5 pb-3">
          {json == null ? <span className="text-muted-foreground">{empty}</span> : <JsonTree json={json} />}
        </div>
      )}
    </section>
  )
}

/** The output as a foldable section; open by default unless nothing was printed. */
function OutputSection({ m, out }: { m: MergedMission; out: OutputStreamState }) {
  const printed = out.lines.length > 0 || !out.done
  const [chosen, setChosen] = useState<boolean | null>(null)
  const open = chosen ?? printed
  const meta = out.lines.length > 0 ? `${lineCount(out.lines)} lines` : out.done ? 'nothing printed' : undefined
  const toggle = (
    <SectionToggle open={open} onToggle={() => setChosen(!open)} title="Output" meta={open ? undefined : meta} />
  )
  if (!open) {
    return (
      <section className="border-b">
        <div onClick={() => setChosen(!open)} className="flex h-10 cursor-pointer items-center px-5 hover:bg-muted">
          {toggle}
        </div>
      </section>
    )
  }
  return (
    <LogPane
      stream={out}
      status={m.status}
      truncatedStdout={m.truncated_stdout}
      truncatedStderr={m.truncated_stderr}
      heading={toggle}
      onHeaderClick={() => setChosen(!open)}
      fit
      className="border-b"
    />
  )
}

function RunBody({ m, out }: { m: MergedMission; out: OutputStreamState }) {
  return (
    <div className="min-h-0 overflow-auto">
      <OutputSection m={m} out={out} />
      <DataSection title="Return" json={m.return} empty={m.status === 'done' ? 'Nothing returned.' : 'No return value yet.'} name="return" />
      <DataSection title="Input" json={m.input} empty="No input." name="input" />
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
  const fromMission = reportedByMission(m)
  const text = failureText(m)
  const reason = m.fail_reason && m.fail_reason !== 'explicit' ? m.fail_reason : undefined
  const ref = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [clipped, setClipped] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (el && !open) setClipped(el.scrollHeight > el.clientHeight + 1)
  }, [text, open])

  return (
    <div className={cn('mt-3 max-w-5xl border-l-2 py-1 pl-3', killed ? 'border-status-warn' : 'border-status-failed')}>
      <div className="flex flex-wrap items-center gap-x-3 text-muted-foreground">
        <Tip label={fromMission ? 'Sent by the mission as its fail event, not printed to its output' : 'Set by dugdale'}>
          <span className={cn('cursor-default font-medium', killed ? 'text-status-warn' : 'text-status-failed')}>
            {fromMission ? 'Reported by the mission' : 'Detected by dugdale'}
          </span>
        </Tip>
        {reason && <span className="font-mono text-[12px]">{reason}</span>}
        <CopyButton value={text} label="Copy message" />
      </div>
      <p
        ref={ref}
        className={cn(
          'mt-1 font-mono text-[12.5px] leading-[1.6] whitespace-pre-wrap break-words',
          open ? 'max-h-[50vh] overflow-auto' : 'line-clamp-4',
        )}
      >
        {text}
      </p>
      {(clipped || open) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-0.5 text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {open ? 'Show less' : 'Show all'}
        </button>
      )}
      {m.fail_details != null && <JsonTree json={m.fail_details} className="mt-2 max-h-48 overflow-auto text-muted-foreground" />}
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
