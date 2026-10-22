import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, Check, Copy, Loader2, WrapText } from 'lucide-react'
import type { OutputStreamState } from '@/hooks/useOutputStream'
import { cn } from '@/lib/utils'
import { lineCount } from '@/lib/format'
import { Tip } from './Tip'
import type { Mission } from '@/lib/types'

type StreamFilter = 'all' | 'stdout' | 'stderr'

/**
 * Live or archived mission output: interleaved stdout/stderr (stderr in red)
 * with a stream filter, wrap toggle and copy. Sticks to the bottom unless the
 * user scrolls up.
 */
export function LogPane({
  stream,
  status,
  truncatedStdout,
  truncatedStderr,
  heading,
  onHeaderClick,
  fit = false,
  className,
}: {
  stream: OutputStreamState
  status: Mission['status']
  truncatedStdout?: boolean
  truncatedStderr?: boolean
  heading?: ReactNode
  /** Makes the whole header row clickable; its own controls stay separate. */
  onHeaderClick?: () => void
  /** Size to the content (up to 60% of the screen) inside a scrolling page,
   *  with the header sticking to its top. */
  fit?: boolean
  className?: string
}) {
  const terminal = status === 'done'
  const { lines, connected, error, trimmed } = stream
  const ref = useRef<HTMLDivElement>(null)
  const [stick, setStick] = useState(true)
  const [filter, setFilter] = useState<StreamFilter>('all')
  const [wrap, setWrap] = useState(true)
  const [copied, setCopied] = useState(false)

  const shown = useMemo(() => (filter === 'all' ? lines : lines.filter((l) => l.stream === filter)), [lines, filter])
  const stderrCount = useMemo(() => lineCount(lines.filter((l) => l.stream === 'stderr')), [lines])
  const shownCount = useMemo(() => lineCount(shown), [shown])

  useEffect(() => {
    if (stick && ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [shown, stick])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 24)
  }

  const copy = () => {
    void navigator.clipboard?.writeText(shown.map((l) => l.data).join(''))
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const live = !terminal && connected

  return (
    <section className={cn('flex flex-col', !fit && 'min-h-0', className)}>
      <div
        onClick={onHeaderClick}
        className={cn(
          'flex h-10 shrink-0 items-center gap-3 px-5',
          fit ? 'sticky top-0 z-10 bg-background' : 'border-b',
          onHeaderClick && 'cursor-pointer hover:bg-muted',
        )}
      >
        {heading ?? <h2 className="font-semibold">Output</h2>}
        {live && <span className="text-status-running">live</span>}
        <div
          className="ml-2 flex items-center rounded-md border border-input bg-background p-0.5"
          role="group"
          aria-label="Streams"
          onClick={(e) => e.stopPropagation()}
        >
          {(['all', 'stdout', 'stderr'] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                'h-6 rounded-[3px] px-2 text-[12px] transition-colors',
                filter === f ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f}
              {f === 'stderr' && stderrCount > 0 && <span className="ml-1 opacity-70">{stderrCount}</span>}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1 text-muted-foreground" onClick={(e) => e.stopPropagation()}>
          <span className="mr-2 text-[12px]">
            {shownCount} {shownCount === 1 ? 'line' : 'lines'}
          </span>
          <Tip label={wrap ? 'Don’t wrap long lines' : 'Wrap long lines'}>
            <button
              type="button"
              aria-label="Wrap long lines"
              aria-pressed={wrap}
              onClick={() => setWrap((w) => !w)}
              className={cn('inline-grid size-7 place-items-center rounded-md hover:bg-accent hover:text-foreground', wrap && 'text-foreground')}
            >
              <WrapText className="size-3.5" />
            </button>
          </Tip>
          <Tip label={copied ? 'Copied' : 'Copy output'}>
            <button
              type="button"
              aria-label="Copy output"
              onClick={copy}
              disabled={shown.length === 0}
              className="inline-grid size-7 place-items-center rounded-md hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              {copied ? <Check className="size-3.5 text-status-success" /> : <Copy className="size-3.5" />}
            </button>
          </Tip>
        </div>
      </div>
      <div className={cn('relative', !fit && 'min-h-0 flex-1')}>
        <div ref={ref} onScroll={onScroll} className={cn('overflow-auto px-5', fit ? 'max-h-[60vh] pb-3' : 'h-full py-3')}>
          {shown.length === 0 ? (
            error ? (
              <span className="text-status-failed">Couldn’t load output: {error}</span>
            ) : terminal && !connected ? (
              <span className="text-muted-foreground">{filter === 'all' ? 'No output.' : `Nothing on ${filter}.`}</span>
            ) : (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {terminal ? 'Loading output…' : 'Waiting for output…'}
              </span>
            )
          ) : (
            <>
              {trimmed && <div className="mb-2 text-status-warn">Earlier output is not shown (over 5000 lines).</div>}
              <pre
                className={cn(
                  'font-mono text-[12.5px] leading-[1.6]',
                  wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
                )}
              >
                {shown.map((l, i) => (
                  <span key={i} className={l.stream === 'stderr' ? 'text-status-failed' : undefined}>
                    {l.data}
                  </span>
                ))}
              </pre>
              {error && <div className="mt-2 text-status-failed">The output stream broke off here: {error}</div>}
            </>
          )}
          {(truncatedStdout || truncatedStderr) && (
            <div className="mt-2 text-status-warn">
              The dugdale truncated {truncatedStdout && truncatedStderr ? 'stdout and stderr' : truncatedStdout ? 'stdout' : 'stderr'}.
            </div>
          )}
        </div>
        {!stick && (
          <button
            type="button"
            onClick={() => setStick(true)}
            className="absolute right-5 bottom-3 inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[12px] shadow-sm hover:bg-accent"
          >
            <ArrowDown className="size-3" />
            Latest
          </button>
        )}
      </div>
    </section>
  )
}
