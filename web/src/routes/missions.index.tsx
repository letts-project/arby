import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useInfiniteList } from '@/hooks/useInfiniteList'
import { useScrollTop } from '@/hooks/useScrollTop'
import { useHosts } from '@/hooks/useHosts'
import { useLanes } from '@/hooks/useLanes'
import { sortBy } from '@/lib/sort'
import { normalizeSearch, toFilter, type MissionSearch } from '@/lib/missionSearch'
import { FAILURE_OUTCOMES, MISSION_STATES } from '@/lib/missionView'
import { selectionKey, toBulkItems } from '@/lib/selection'
import { MissionsTable, type MissionSelection } from '@/components/MissionsTable'
import { BulkActionBar } from '@/components/BulkActionBar'
import { FilterSelect, TabCount, TextFilter, tabClass } from '@/components/filters'
import { UnavailableNote } from '@/components/UnavailableNote'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Skeleton } from '@/components/ui/skeleton'
import { InfiniteTail } from '@/components/InfiniteTail'
import { LiveState } from '@/components/LiveState'

export const Route = createFileRoute('/missions/')({
  validateSearch: normalizeSearch,
  component: MissionsList,
})

const EMPTY: Record<string, string> = {
  all: 'No missions yet.',
  running: 'Nothing is running.',
  queued: 'Nothing is waiting in a queue.',
  failed: 'No failures.',
  succeeded: 'No successful missions.',
  killed: 'No killed missions.',
}

function MissionsList() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const searchKey = JSON.stringify(search)
  const filter = toFilter(search)
  const scroll = useScrollTop()
  const list = useInfiniteList('missions', '/api/missions', filter, scroll.atTop)
  const { items, isLoading, isError, error, refetch, isFetching, isFetchingNextPage } = list
  const patch = (p: Partial<MissionSearch>) => void navigate({ search: (prev) => ({ ...prev, ...p }) })
  const { toTop } = scroll
  useEffect(() => toTop(), [searchKey, toTop])

  const { data: hostsData } = useHosts()
  const hostOptions = useMemo(
    () => sortBy((hostsData?.hosts ?? []).filter((h) => h.managed).map((h) => h.id), (id) => id, 'asc'),
    [hostsData],
  )
  const { data: lanesData } = useLanes()
  const lanes = lanesData?.lanes ?? []
  const laneOptions = useMemo(() => {
    const scoped = search.host ? lanes.filter((l) => l.host === search.host) : lanes
    return sortBy(Array.from(new Set(scoped.map((l) => l.name))), (n) => n, 'asc')
  }, [lanes, search.host])
  const live = lanes.filter((l) => (!search.host || l.host === search.host) && (!search.lane || l.name === search.lane))
  const counts: Record<string, number | undefined> = {
    running: live.reduce((n, l) => n + l.running, 0),
    queued: live.reduce((n, l) => n + l.queued, 0),
  }

  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => setSelected(new Set()), [searchKey])
  const keys = items.map(selectionKey)
  const selection: MissionSelection = {
    isSelected: (m) => selected.has(selectionKey(m)),
    toggle: (m) =>
      setSelected((s) => {
        const n = new Set(s)
        const k = selectionKey(m)
        if (n.has(k)) n.delete(k)
        else n.add(k)
        return n
      }),
    toggleAll: () =>
      setSelected((s) => {
        const all = keys.length > 0 && keys.every((k) => s.has(k))
        const n = new Set(s)
        keys.forEach((k) => (all ? n.delete(k) : n.add(k)))
        return n
      }),
    allSelected: keys.length > 0 && keys.every((k) => selected.has(k)),
    someSelected: keys.some((k) => selected.has(k)),
  }

  const scoped = !!(search.host || search.lane || search.mission || search.outcome)
  const keep = { host: search.host, lane: search.lane, mission: search.mission, order: search.order, limit: search.limit }
  const timeBy = search.order === 'finished' ? 'finished' : 'created'

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b px-5 pt-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold">Missions</h1>
          <LiveState fetching={isFetching && !isFetchingNextPage} held={!scroll.atTop} />
          <UnavailableNote hosts={list.unavailableHosts} reasons={list.unavailableReasons} className="ml-auto" />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <nav className="flex items-end gap-5" aria-label="Mission state">
            <Link to="/missions" search={keep} className={tabClass(!search.state)}>
              All
            </Link>
            {MISSION_STATES.map((s) => (
              <Link key={s.value} to="/missions" search={{ ...keep, state: s.value }} className={tabClass(search.state === s.value)}>
                {s.label}
                <TabCount n={counts[s.value]} tone={s.value === 'running' ? 'text-status-running' : undefined} />
              </Link>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-2 pb-2">
            {search.state === 'failed' && (
              <FilterSelect
                label="Outcome"
                anyLabel="any failure"
                value={search.outcome}
                options={FAILURE_OUTCOMES}
                onChange={(v) => patch({ outcome: v })}
              />
            )}
            {hostOptions.length > 1 && (
              <FilterSelect label="Host" value={search.host} options={hostOptions} onChange={(v) => patch({ host: v, lane: undefined })} />
            )}
            <FilterSelect label="Lane" value={search.lane} options={laneOptions} onChange={(v) => patch({ lane: v })} />
            <TextFilter value={search.mission} placeholder="Mission name contains" onCommit={(v) => patch({ mission: v })} />
            <FilterSelect
              label="Sort"
              anyLabel="newest first"
              value={search.order === 'finished' ? 'finished' : undefined}
              options={[{ value: 'finished', label: 'recently finished' }]}
              onChange={(v) => patch({ order: v === 'finished' ? 'finished' : undefined })}
            />
          </div>
        </div>
      </div>

      <div ref={scroll.ref} onScroll={scroll.onScroll} className="min-h-0 flex-1 overflow-auto">
        {isError && items.length === 0 ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <div className="flex flex-col gap-2 p-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-7 rounded" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title={EMPTY[search.state ?? 'all']}
            hint={scoped ? 'Filters are narrowing this list.' : undefined}
            action={
              scoped ? (
                <Link to="/missions" search={search.state ? { state: search.state } : {}} className="underline underline-offset-4">
                  Clear filters
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <MissionsTable rows={items} selection={selection} timeBy={timeBy} />
            <InfiniteTail
              root={scroll.ref}
              hasNextPage={list.hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              isError={list.isFetchNextPageError}
              fetchNextPage={() => void list.fetchNextPage()}
              loaded={`${items.length} mission${items.length === 1 ? '' : 's'}`}
            />
          </>
        )}
      </div>

      {selected.size > 0 && (
        <BulkActionBar items={toBulkItems(items, selected)} onClear={() => setSelected(new Set())} />
      )}
    </div>
  )
}
