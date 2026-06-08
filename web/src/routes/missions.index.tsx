import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Inbox, Loader2 } from 'lucide-react'
import { useMissions } from '@/hooks/useMissions'
import { useHosts } from '@/hooks/useHosts'
import { useCursorPager } from '@/hooks/useCursorPager'
import { normalizeSearch, toFilter, type MissionSearch } from '@/lib/missionSearch'
import { selectionKey, toBulkItems } from '@/lib/selection'
import { PageHeader } from '@/components/PageHeader'
import { UnavailableHostsBanner } from '@/components/UnavailableHostsBanner'
import { MissionFilters } from '@/components/MissionFilters'
import { MissionsTable, type MissionSelection } from '@/components/MissionsTable'
import { BulkActionBar } from '@/components/BulkActionBar'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/missions/')({
  validateSearch: normalizeSearch,
  component: MissionsList,
})

function MissionsList() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data, isLoading, isError, error, refetch, isFetching } = useMissions(toFilter(search))

  const goCursor = (cursor: string | undefined) =>
    navigate({ search: (prev) => ({ ...prev, cursor }) })
  const pager = useCursorPager(search.cursor, data?.next_cursor, goCursor)
  // Filter changes reset the cursor (back to page 1) and the pager history.
  const patch = (p: Partial<MissionSearch>) => {
    pager.reset()
    navigate({ search: (prev) => ({ ...prev, ...p, cursor: undefined }) })
  }
  const clear = () => {
    pager.reset()
    navigate({ search: {} })
  }

  // Filter options come from the configured host set (the server filters by
  // host), not from the current page — a page that happens to contain one host
  // must not hide the control or shrink the choices.
  const { data: hostsData } = useHosts()
  const hostOptions = useMemo(
    () => (hostsData?.hosts ?? []).filter((h) => h.managed).map((h) => h.id),
    [hostsData],
  )
  const items = data?.items ?? []

  // Selection for bulk actions, reset whenever the filters/page change.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const searchKey = JSON.stringify(search)
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

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Missions" count={items.length}>
        {isFetching && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      </PageHeader>
      <UnavailableHostsBanner hosts={data?.unavailable_hosts} reasons={data?.unavailable_reasons} />
      <div className="border-b px-4 py-2">
        <MissionFilters search={search} hostOptions={hostOptions} onChange={patch} onClear={clear} />
      </div>

      <div className="flex-1 overflow-auto">
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-8 rounded" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No missions match these filters"
            hint="Try clearing filters or widening the time window."
            icon={<Inbox className="size-6" />}
          />
        ) : (
          <MissionsTable rows={items} selection={selection} />
        )}
      </div>

      {selected.size > 0 && (
        <BulkActionBar items={toBulkItems(items, selected)} onClear={() => setSelected(new Set())} />
      )}

      <footer className="flex h-10 shrink-0 items-center justify-end gap-2 border-t px-4">
        <button
          type="button"
          disabled={!pager.hasPrev}
          onClick={pager.goPrev}
          className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[12px] transition-colors enabled:hover:bg-accent disabled:opacity-40"
        >
          <ChevronLeft className="size-3.5" />
          Prev
        </button>
        <button
          type="button"
          disabled={!pager.hasNext}
          onClick={pager.goNext}
          className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[12px] transition-colors enabled:hover:bg-accent disabled:opacity-40"
        >
          Next
          <ChevronRight className="size-3.5" />
        </button>
      </footer>
    </div>
  )
}
