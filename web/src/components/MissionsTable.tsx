import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
} from '@tanstack/react-table'
import { StatusBadge } from './StatusBadge'
import { Where } from './Where'
import { Duration } from './Duration'
import { Ago } from './Ago'
import { MissionRowActions } from './MissionRowActions'
import { Checkbox } from '@/components/ui/checkbox'
import { useLanes } from '@/hooks/useLanes'
import { useHoverLock } from '@/lib/interactionLock'
import { failureText, inputSummary, isFailure, missionTitle } from '@/lib/missionView'
import { cn } from '@/lib/utils'
import type { MergedMission } from '@/lib/types'

export interface MissionSelection {
  isSelected: (m: MergedMission) => boolean
  toggle: (m: MergedMission) => void
  toggleAll: () => void
  allSelected: boolean
  someSelected: boolean
}

// Selection and the time column live in table meta so the column defs can be
// memoized once: rebuilding them remounts every cell and would close an open
// row menu or confirm dialog on the next poll.
declare module '@tanstack/react-table' {
  interface TableMeta<TData extends RowData> {
    selection?: MissionSelection
    timeBy?: 'created' | 'finished'
    pausedLanes?: Set<string>
  }
}

const col = createColumnHelper<MergedMission>()

/** What the row is about: why it failed (if it did) and what it was given. */
export function MissionDetails({ m }: { m: MergedMission }) {
  const why = isFailure(m) ? failureText(m) : ''
  const input = inputSummary(m.input)
  if (!why && !input) return null
  return (
    <span className="block truncate" title={[why, input].filter(Boolean).join('\n')}>
      {why && <span className="mr-3">{why}</span>}
      {input && <span className="font-mono text-[12px] text-muted-foreground">{input}</span>}
    </span>
  )
}

/** The missions grid. Each row is a real link to the detail page (a stretched
 *  `<Link>`), so cmd/middle-click open a new tab; checkboxes and row actions
 *  sit above it. */
export function MissionsTable({
  rows,
  selection,
  timeBy = 'created',
  embedded = false,
}: {
  rows: MergedMission[]
  selection?: MissionSelection
  timeBy?: 'created' | 'finished'
  /** Inside a padded page section: no sticky header, no outer gutters. */
  embedded?: boolean
}) {
  const hasSelection = !!selection
  const hover = useHoverLock()
  const { data: lanesData } = useLanes()
  const pausedLanes = useMemo(
    () => new Set((lanesData?.lanes ?? []).filter((l) => l.paused).map((l) => `${l.host}/${l.name}`)),
    [lanesData],
  )
  const columns = useMemo(() => {
    const base: ColumnDef<MergedMission, unknown>[] = [
      col.accessor('status', {
        header: 'Status',
        meta: { className: 'w-[104px]' },
        cell: (c) => <StatusBadge mission={c.row.original} />,
      }),
      col.display({
        id: 'name',
        header: 'Mission',
        meta: { className: 'w-[1%]' },
        cell: (c) => <span className="block max-w-[18rem] truncate font-medium">{missionTitle(c.row.original)}</span>,
      }),
      col.accessor('host', {
        header: 'Where',
        meta: { className: 'w-[1%]' },
        cell: ({ row, table }) => {
          const m = row.original
          const paused = !!m.lane && m.status === 'queued' && !!table.options.meta?.pausedLanes?.has(`${m.host}/${m.lane}`)
          return (
            <span title={paused ? `${m.host}/${m.lane} is paused` : undefined} className={cn(paused && 'text-status-warn')}>
              <Where host={m.host} lane={m.lane} />
              {paused && <span className="ml-1.5">paused</span>}
            </span>
          )
        },
      }),
      col.display({
        id: 'details',
        header: 'Details',
        meta: { className: 'w-full max-w-0' },
        cell: (c) => <MissionDetails m={c.row.original} />,
      }),
      col.display({
        id: 'duration',
        header: 'Duration',
        meta: { className: 'w-[1%] text-right' },
        cell: (c) => <Duration mission={c.row.original} />,
      }),
      col.display({
        id: 'time',
        header: ({ table }) => (table.options.meta?.timeBy === 'finished' ? 'Finished' : 'Created'),
        meta: { className: 'w-[1%] text-right' },
        cell: ({ row, table }) => (
          <Ago
            ms={table.options.meta?.timeBy === 'finished' ? row.original.time_finished : row.original.time_created}
            className="text-muted-foreground"
          />
        ),
      }),
      col.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: 'w-[1%] py-0' },
        cell: (c) => (
          <div className="relative z-10">
            <MissionRowActions mission={c.row.original} />
          </div>
        ),
      }),
    ] as ColumnDef<MergedMission, unknown>[]

    if (!hasSelection) return base

    const selectCol = col.display({
      id: 'select',
      meta: { className: 'w-[1%] pr-0' },
      header: ({ table }) => {
        const sel = table.options.meta?.selection
        if (!sel) return null
        return (
          <span className="relative z-10 flex">
            <Checkbox
              aria-label="Select all loaded missions"
              checked={sel.allSelected ? true : sel.someSelected ? 'indeterminate' : false}
              onCheckedChange={() => sel.toggleAll()}
            />
          </span>
        )
      },
      cell: ({ row, table }) => {
        const sel = table.options.meta?.selection
        if (!sel) return null
        return (
          <span className="relative z-10 flex" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              aria-label="Select mission"
              checked={sel.isSelected(row.original)}
              onCheckedChange={() => sel.toggle(row.original)}
            />
          </span>
        )
      },
    }) as ColumnDef<MergedMission, unknown>
    return [selectCol, ...base]
  }, [hasSelection])

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (m) => `${m.host}/${m.mission_id}`,
    getCoreRowModel: getCoreRowModel(),
    meta: { selection, timeBy, pausedLanes },
  })

  return (
    <table className="w-full table-auto border-collapse">
      <thead className={cn('bg-background', !embedded && 'sticky top-0 z-20')}>
        {table.getHeaderGroups().map((hg) => (
          <tr key={hg.id}>
            {hg.headers.map((h) => (
              <th
                key={h.id}
                className={cn(
                  'border-b px-3 py-2 text-left text-[12px] font-medium whitespace-nowrap text-muted-foreground',
                  embedded ? 'first:pl-0 last:pr-0' : 'first:pl-5 last:pr-4',
                  (h.column.columnDef.meta as { className?: string } | undefined)?.className,
                )}
              >
                {flexRender(h.column.columnDef.header, h.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody {...hover}>
        {table.getRowModel().rows.map((r) => (
          <tr
            key={r.id}
            className={cn(
              'group/row relative border-b border-border/70 transition-colors hover:bg-muted/60 focus-within:bg-muted/60',
              selection?.isSelected(r.original) && 'bg-status-running/[0.06] hover:bg-status-running/10',
            )}
          >
            {r.getVisibleCells().map((cell, i) => (
              <td
                key={cell.id}
                className={cn(
                  'h-9 px-3 align-middle whitespace-nowrap',
                  embedded ? 'first:pl-0 last:pr-0' : 'first:pl-5 last:pr-4',
                  (cell.column.columnDef.meta as { className?: string } | undefined)?.className,
                )}
              >
                {i === 0 && (
                  <Link
                    to={r.original.kind === 'exec' ? '/exec/$host/$id' : '/missions/$host/$id'}
                    params={{ host: r.original.host, id: r.original.mission_id }}
                    aria-label={`Open mission ${missionTitle(r.original)}`}
                    className="absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  />
                )}
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
