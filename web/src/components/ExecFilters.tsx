import { X } from 'lucide-react'
import { FilterSelect, TextFilter } from '@/components/filters'
import type { ExecSearch } from '@/lib/execSearch'

const STATUSES = ['queued', 'running', 'done']
const OUTCOMES = ['success', 'failed', 'killed', 'timeout', 'crashed', 'lost', 'oom']

/** Exec history filter bar. Substring/argv search is intentionally absent;
 *  filtering is by status/outcome/group/host/order. */
export function ExecFilters({
  search,
  hostOptions,
  onChange,
  onClear,
}: {
  search: ExecSearch
  hostOptions: string[]
  onChange: (patch: Partial<ExecSearch>) => void
  onClear: () => void
}) {
  const active = !!(search.status || search.outcome || search.group_id || search.host || search.order)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect label="status" value={search.status} options={STATUSES} onChange={(v) => onChange({ status: v })} />
      <FilterSelect label="outcome" value={search.outcome} options={OUTCOMES} onChange={(v) => onChange({ outcome: v })} />
      <TextFilter value={search.group_id} placeholder="group_id" width="w-[200px]" onCommit={(v) => onChange({ group_id: v })} />
      {hostOptions.length > 1 && (
        <FilterSelect label="host" value={search.host} options={hostOptions} onChange={(v) => onChange({ host: v })} />
      )}
      <FilterSelect
        label="order"
        value={search.order}
        options={['created', 'finished']}
        onChange={(v) => onChange({ order: v as ExecSearch['order'] })}
      />
      {active && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-3.5" />
          Clear
        </button>
      )}
    </div>
  )
}
