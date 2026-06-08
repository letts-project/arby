import { useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Loader2, Terminal } from 'lucide-react'
import { useExecs } from '@/hooks/useExecs'
import { useHosts } from '@/hooks/useHosts'
import { useCursorPager } from '@/hooks/useCursorPager'
import { normalizeExecSearch, toExecFilter, type ExecSearch } from '@/lib/execSearch'
import { PageHeader } from '@/components/PageHeader'
import { UnavailableHostsBanner } from '@/components/UnavailableHostsBanner'
import { ExecFilters } from '@/components/ExecFilters'
import { ExecTable } from '@/components/ExecTable'
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
  const { data, isLoading, isError, error, refetch, isFetching } = useExecs(toExecFilter(search))

  const goCursor = (cursor: string | undefined) =>
    navigate({ search: (prev) => ({ ...prev, cursor }) })
  const pager = useCursorPager(search.cursor, data?.next_cursor, goCursor)
  const patch = (p: Partial<ExecSearch>) => {
    pager.reset()
    navigate({ search: (prev) => ({ ...prev, ...p, cursor: undefined }) })
  }
  const clear = () => {
    pager.reset()
    navigate({ search: {} })
  }

  // Filter options come from the configured host set (the server filters by
  // host), not from the current page (see missions.index.tsx).
  const { data: hostsData } = useHosts()
  const hostOptions = useMemo(
    () => (hostsData?.hosts ?? []).filter((h) => h.managed).map((h) => h.id),
    [hostsData],
  )
  const items = data?.items ?? []

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Exec" count={items.length}>
        {isFetching && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      </PageHeader>
      <UnavailableHostsBanner hosts={data?.unavailable_hosts} reasons={data?.unavailable_reasons} />
      <div className="border-b px-4 py-2">
        <ExecFilters search={search} hostOptions={hostOptions} onChange={patch} onClear={clear} />
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
            title="No exec commands match these filters"
            hint="Ad-hoc commands run via `letts exec` appear here."
            icon={<Terminal className="size-6" />}
          />
        ) : (
          <ExecTable rows={items} />
        )}
      </div>

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
