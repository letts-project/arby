import { useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useDugdales } from '@/hooks/useDugdales'
import { useLanes } from '@/hooks/useLanes'
import { QueuesTable } from '@/components/QueuesTable'
import { FilterSelect } from '@/components/filters'
import { ErrorState } from '@/components/ErrorState'
import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/dugdales/')({
  validateSearch: (raw: Record<string, unknown>): { label?: string } =>
    typeof raw.label === 'string' && raw.label !== '' ? { label: raw.label } : {},
  component: Dugdales,
})

function Dugdales() {
  const { label } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data, isLoading, isError, error, refetch } = useDugdales()
  const { data: lanesData } = useLanes()
  const hosts = data?.hosts ?? []
  const labels = useMemo(() => Array.from(new Set(hosts.flatMap((h) => h.labels ?? []))).sort(), [hosts])
  const active = label && labels.includes(label) ? label : undefined
  const shown = active ? hosts.filter((h) => (h.labels ?? []).includes(active)) : hosts
  const up = hosts.filter((h) => h.online).length

  return (
    <div className="px-5 pt-4 pb-10">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[17px] font-semibold">Dugdales</h1>
        {data && (
          <span className="text-muted-foreground">
            {up} of {hosts.length} up
          </span>
        )}
        {labels.length > 0 && (
          <div className="ml-auto self-center">
            <FilterSelect
              label="Label"
              value={active}
              options={labels}
              onChange={(v) => void navigate({ search: v ? { label: v } : {} })}
            />
          </div>
        )}
      </div>
      <div className="mt-3 max-w-5xl">
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <Skeleton className="h-64 rounded" />
        ) : hosts.length === 0 ? (
          <EmptyState title="No dugdales configured" hint="arby lists the dugdales from letts.yaml." />
        ) : (
          <QueuesTable hosts={shown} lanes={lanesData?.lanes ?? []} reasons={data?.unavailable_reasons} detailed />
        )}
      </div>
    </div>
  )
}
