import { X } from 'lucide-react'
import { FilterSelect, TextFilter } from '@/components/filters'
import type { MissionSearch } from '@/lib/missionSearch'

const STATUSES = ['queued', 'running', 'done']
const OUTCOMES = ['success', 'failed', 'killed', 'timeout', 'crashed', 'lost', 'oom']

/** The missions filter bar. Selects commit immediately; text inputs commit on
 *  Enter/blur. Every change goes through onChange (the route writes the URL). */
export function MissionFilters({
  search,
  hostOptions,
  onChange,
  onClear,
}: {
  search: MissionSearch
  hostOptions: string[]
  onChange: (patch: Partial<MissionSearch>) => void
  onClear: () => void
}) {
  const active = !!(
    search.status ||
    search.outcome ||
    search.lane ||
    search.mission ||
    search.host ||
    search.order
  )
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect label="status" value={search.status} options={STATUSES} onChange={(v) => onChange({ status: v })} />
      <FilterSelect label="outcome" value={search.outcome} options={OUTCOMES} onChange={(v) => onChange({ outcome: v })} />
      <TextFilter value={search.lane} placeholder="lane" onCommit={(v) => onChange({ lane: v })} />
      <TextFilter value={search.mission} placeholder="mission name" onCommit={(v) => onChange({ mission: v })} />
      {hostOptions.length > 1 && (
        <FilterSelect label="host" value={search.host} options={hostOptions} onChange={(v) => onChange({ host: v })} />
      )}
      <FilterSelect
        label="order"
        value={search.order}
        options={['created', 'finished']}
        onChange={(v) => onChange({ order: v as MissionSearch['order'] })}
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
