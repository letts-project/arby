import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useDugdales } from '@/hooks/useDugdales'
import { PageHeader } from '@/components/PageHeader'
import { UnavailableHostsBanner } from '@/components/UnavailableHostsBanner'
import { FilterSelect } from '@/components/filters'
import { ErrorState } from '@/components/ErrorState'
import { EmptyState } from '@/components/EmptyState'
import { DTable, DThead, DTh, DTr, DTd, SortableDTh } from '@/components/Table'
import { Skeleton } from '@/components/ui/skeleton'
import { useTableSort } from '@/hooks/useTableSort'
import { cn } from '@/lib/utils'
import { fmtAgo, fmtDuration } from '@/lib/format'
import type { HostStatus } from '@/lib/types'

export const Route = createFileRoute('/dugdales')({ component: Dugdales })

// Sort accessors per column. host uses the dugdale id, which the natural-order
// collator orders s2 < s10 (the default sort below).
const sortAccessors: Record<string, (h: HostStatus) => unknown> = {
  host: (h) => h.id,
  labels: (h) => h.labels?.[0] ?? '',
  version: (h) => h.version,
  uptime: (h) => h.uptime_seconds,
  applied: (h) => h.applied_at,
  queued: (h) => h.queue_summary.queued,
  running: (h) => h.queue_summary.running,
}

function Dugdales() {
  const { data, isLoading, isError, error, refetch } = useDugdales()
  const hosts = data?.hosts ?? []
  const [label, setLabel] = useState<string | undefined>(undefined)
  const allLabels = useMemo(
    () => Array.from(new Set(hosts.flatMap((h) => h.labels ?? []))).sort(),
    [hosts],
  )
  // A selection can go stale if the host set changes; treat an unknown label as
  // "no filter" so the list never silently shows nothing.
  const activeLabel = label && allLabels.includes(label) ? label : undefined
  const shown = activeLabel ? hosts.filter((h) => (h.labels ?? []).includes(activeLabel)) : hosts
  const { sort, toggle, sorted } = useTableSort(sortAccessors, { key: 'host', dir: 'asc' })

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Dugdales" count={shown.length} />
      <UnavailableHostsBanner hosts={data?.unavailable_hosts} reasons={data?.unavailable_reasons} />
      {allLabels.length > 0 && (
        <div className="border-b px-4 py-2">
          <FilterSelect label="label" value={activeLabel} options={allLabels} onChange={setLabel} />
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 rounded" />
            ))}
          </div>
        ) : hosts.length === 0 ? (
          <EmptyState title="No dugdales configured" hint="Check letts.yaml" />
        ) : (
          <DTable>
            <DThead>
              <tr>
                <SortableDTh sortKey="host" sort={sort} onToggle={toggle}>Host</SortableDTh>
                <SortableDTh sortKey="labels" sort={sort} onToggle={toggle}>Labels</SortableDTh>
                <SortableDTh sortKey="version" sort={sort} onToggle={toggle}>Version</SortableDTh>
                <SortableDTh sortKey="uptime" sort={sort} onToggle={toggle}>Uptime</SortableDTh>
                <SortableDTh sortKey="applied" sort={sort} onToggle={toggle}>Applied</SortableDTh>
                <SortableDTh sortKey="queued" sort={sort} onToggle={toggle} className="text-right">Queued</SortableDTh>
                <SortableDTh sortKey="running" sort={sort} onToggle={toggle} className="text-right">Running</SortableDTh>
                <DTh></DTh>
              </tr>
            </DThead>
            <tbody>
              {sorted(shown).map((h) => {
                // Managed hosts link to their applied-config view. A stretched
                // <Link> makes the whole row a real <a href> (so cmd/middle-click
                // open a new tab); the label chips sit above it so they filter
                // instead of navigating. Unmanaged hosts have no config endpoint,
                // so their row is inert (no link).
                return (
                  <DTr
                    key={h.id}
                    className={cn(
                      !h.online && 'opacity-50',
                      // `relative` anchors the stretched link; `focus-within`
                      // highlights the row while that link is focused.
                      h.managed && 'relative cursor-pointer focus-within:bg-accent',
                    )}
                  >
                    <DTd>
                      {h.managed && (
                        <Link
                          to="/config/$host"
                          params={{ host: h.id }}
                          aria-label={`View config for ${h.id}`}
                          className="absolute inset-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                        />
                      )}
                      <span className="flex items-center gap-2">
                        <span
                          className={cn('size-2 rounded-full', h.online ? 'bg-status-success' : 'bg-status-failed')}
                          aria-hidden
                        />
                        <span className="font-mono text-[13px] font-medium">{h.id}</span>
                        {!h.online && <span className="text-[11px] text-status-failed">offline</span>}
                        {!h.managed && (
                          <span
                            className="rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground"
                            title="No admin token for this host — arby shows health/version only; it is excluded from listings and actions."
                          >
                            unmanaged
                          </span>
                        )}
                      </span>
                    </DTd>
                    <DTd>
                      {h.labels && h.labels.length > 0 ? (
                        // Lifted above the row's stretched link so a chip click
                        // filters instead of navigating.
                        <span className="relative z-10 flex flex-wrap gap-1">
                          {Array.from(new Set(h.labels)).map((l) => (
                            <button
                              key={l}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setLabel(l)
                              }}
                              title={`Filter by ${l}`}
                              className={cn(
                                'rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium transition-colors hover:bg-accent hover:text-foreground',
                                activeLabel === l ? 'border-primary text-primary' : 'text-muted-foreground',
                              )}
                            >
                              {l}
                            </button>
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </DTd>
                    <DTd className="font-mono text-[12px] text-muted-foreground">{h.version ?? '—'}</DTd>
                    <DTd className="text-muted-foreground">
                      {h.online && h.managed ? fmtDuration((h.uptime_seconds ?? 0) * 1000) : '—'}
                    </DTd>
                    <DTd className="text-muted-foreground">
                      {h.online && h.managed ? fmtAgo(h.applied_at ?? undefined) : '—'}
                    </DTd>
                    <DTd className="text-right font-mono tabular">
                      {h.online && h.managed ? h.queue_summary.queued : '—'}
                    </DTd>
                    <DTd className="text-right font-mono tabular text-status-running">
                      {h.online && h.managed ? h.queue_summary.running || '' : '—'}
                    </DTd>
                    <DTd className="text-right">
                      {h.managed && <ChevronRight className="inline size-3.5 text-muted-foreground" aria-hidden />}
                    </DTd>
                  </DTr>
                )
              })}
            </tbody>
          </DTable>
        )}
      </div>
    </div>
  )
}
