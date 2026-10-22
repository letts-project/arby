import { useEffect, useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useInfiniteList } from '@/hooks/useInfiniteList'
import { useScrollTop } from '@/hooks/useScrollTop'
import { useHosts } from '@/hooks/useHosts'
import { normalizeExecSearch, toExecFilter, type ExecSearch } from '@/lib/execSearch'
import { groupExecs } from '@/lib/execGroups'
import { FAILURE_OUTCOMES, MISSION_STATES } from '@/lib/missionView'
import { sortBy } from '@/lib/sort'
import { ExecTable } from '@/components/ExecTable'
import { FilterSelect, tabClass } from '@/components/filters'
import { UnavailableNote } from '@/components/UnavailableNote'
import { InfiniteTail } from '@/components/InfiniteTail'
import { LiveState } from '@/components/LiveState'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/exec/')({
  validateSearch: normalizeExecSearch,
  component: ExecList,
})

function ExecList() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const searchKey = JSON.stringify(search)
  const scroll = useScrollTop()
  const list = useInfiniteList('execs', '/api/exec', toExecFilter(search), scroll.atTop)
  const { items, isLoading, isError, error, refetch, isFetching, isFetchingNextPage } = list
  const patch = (p: Partial<ExecSearch>) => void navigate({ search: (prev) => ({ ...prev, ...p }) })
  const { toTop } = scroll
  useEffect(() => toTop(), [searchKey, toTop])

  const { data: hostsData } = useHosts()
  const hostOptions = useMemo(
    () => sortBy((hostsData?.hosts ?? []).filter((h) => h.managed).map((h) => h.id), (id) => id, 'asc'),
    [hostsData],
  )
  const runs = useMemo(() => groupExecs(items), [items])
  const keep = { host: search.host, group_id: search.group_id, order: search.order, limit: search.limit }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b px-5 pt-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-semibold">Exec</h1>
          <span className="text-muted-foreground">ad-hoc commands run with letts exec</span>
          <LiveState fetching={isFetching && !isFetchingNextPage} held={!scroll.atTop} />
          <UnavailableNote hosts={list.unavailableHosts} reasons={list.unavailableReasons} className="ml-auto" />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <nav className="flex items-end gap-5" aria-label="Exec state">
            <Link to="/exec" search={keep} className={tabClass(!search.state)}>
              All
            </Link>
            {MISSION_STATES.map((s) => (
              <Link key={s.value} to="/exec" search={{ ...keep, state: s.value }} className={tabClass(search.state === s.value)}>
                {s.label}
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
              <FilterSelect label="Host" value={search.host} options={hostOptions} onChange={(v) => patch({ host: v })} />
            )}
          </div>
        </div>
      </div>

      <div ref={scroll.ref} onScroll={scroll.onScroll} className="min-h-0 flex-1 overflow-auto">
        {isError && items.length === 0 ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <div className="flex flex-col gap-2 p-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-7 rounded" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <EmptyState
            title="No commands here."
            hint={search.state || search.host ? 'Filters are narrowing this list.' : 'Commands run with letts exec show up here.'}
          />
        ) : (
          <>
            <ExecTable runs={runs} />
            <InfiniteTail
              root={scroll.ref}
              hasNextPage={list.hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              isError={list.isFetchNextPageError}
              fetchNextPage={() => void list.fetchNextPage()}
              loaded={`${runs.length} run${runs.length === 1 ? '' : 's'}`}
            />
          </>
        )}
      </div>
    </div>
  )
}
