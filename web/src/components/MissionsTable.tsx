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
import { HostChip } from './HostChip'
import { LaneChip } from './LaneChip'
import { Duration } from './Duration'
import { CopyButton } from './CopyButton'
import { MissionRowActions } from './MissionRowActions'
import { Checkbox } from '@/components/ui/checkbox'
import { fmtAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { MergedMission } from '@/lib/types'

export interface MissionSelection {
  isSelected: (m: MergedMission) => boolean
  toggle: (m: MergedMission) => void
  toggleAll: () => void
  allSelected: boolean
  someSelected: boolean
}

// Selection is read from table meta (not closed over by the column defs) so the
// columns can be memoized ONCE. Rebuilding columns each render makes TanStack's
// flexRender treat every cell fn as a fresh component type and remount the whole
// cell subtree — which would tear down an open row menu/dialog on the next
// re-render (e.g. when a background poll or the interaction lock fires).
declare module '@tanstack/react-table' {
  interface TableMeta<TData extends RowData> {
    selection?: MissionSelection
  }
}

const col = createColumnHelper<MergedMission>()

function IdCell({ id }: { id: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="whitespace-nowrap font-mono text-[12px] text-muted-foreground">{id}</span>
      {/* Lifted above the row's stretched link so the copy click isn't swallowed. */}
      <span className="relative z-10">
        <CopyButton value={id} label="Copy mission id" />
      </span>
    </span>
  )
}

/** Dense, clickable mission grid (TanStack Table). Each row is a real link to
 *  the detail page (a stretched `<Link>` overlay) so cmd/middle-click open it in
 *  a new tab; an optional selection model adds a leading checkbox column. */
export function MissionsTable({ rows, selection }: { rows: MergedMission[]; selection?: MissionSelection }) {
  // Stable columns: depend only on whether a selection model exists, never on
  // its (per-render) identity. The checkbox column reads live state from meta.
  const hasSelection = !!selection
  const columns = useMemo(() => {
    const base: ColumnDef<MergedMission, unknown>[] = [
      col.accessor('status', { header: 'Status', cell: (c) => <StatusBadge mission={c.row.original} /> }),
      col.accessor('host', { header: 'Host', cell: (c) => <HostChip host={c.getValue()} /> }),
      col.accessor('lane', { header: 'Lane', cell: (c) => <LaneChip lane={c.getValue()} /> }),
      col.display({
        id: 'name',
        header: 'Mission',
        cell: (c) => {
          const m = c.row.original
          return <span className="block max-w-[22rem] truncate">{m.mission_name || m.display_name || '—'}</span>
        },
      }),
      col.accessor('mission_id', { header: 'ID', cell: (c) => <IdCell id={c.getValue()} /> }),
      col.display({ id: 'duration', header: 'Duration', cell: (c) => <Duration mission={c.row.original} /> }),
      col.accessor('time_created', {
        header: 'Created',
        cell: (c) => <span className="whitespace-nowrap text-muted-foreground">{fmtAgo(c.getValue())}</span>,
      }),
      col.display({
        id: 'actions',
        header: '',
        // Lifted above the row's stretched link so the menu stays clickable.
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
      header: ({ table }) => {
        const sel = table.options.meta?.selection
        if (!sel) return null
        return (
          <span className="relative z-10" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              aria-label="Select all"
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
          <span className="relative z-10" onClick={(e) => e.stopPropagation()}>
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

  // Stable per-mission row id (not the array index) so a background refetch that
  // reorders or inserts rows doesn't remount cells — open menus/dialogs survive.
  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (m) => `${m.host}/${m.mission_id}`,
    getCoreRowModel: getCoreRowModel(),
    meta: { selection },
  })

  return (
    <table className="w-full border-collapse text-[13px]">
      <thead className="sticky top-0 z-10 bg-background text-[11px] uppercase tracking-wide text-muted-foreground">
        {table.getHeaderGroups().map((hg) => (
          <tr key={hg.id}>
            {hg.headers.map((h) => (
              <th key={h.id} className="border-b px-3 py-2 text-left font-medium whitespace-nowrap">
                {flexRender(h.column.columnDef.header, h.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((r) => (
          // `relative` makes the row the containing block for the stretched link
          // below; `focus-within` highlights the row while that link is focused.
          <tr
            key={r.id}
            className={cn(
              'relative cursor-pointer border-b transition-colors hover:bg-muted/40 focus-within:bg-accent',
              selection?.isSelected(r.original) && 'bg-primary/5',
            )}
          >
            {r.getVisibleCells().map((cell, i) => (
              <td key={cell.id} className="px-3 py-1.5 align-middle">
                {/* One stretched link per row covers the whole <tr> (anchored to
                    the relative row, not this cell). It's a real <a href>, so
                    cmd/ctrl/middle-click and "Open in new tab" all work, while
                    interactive cells (checkbox, copy, actions) sit above it. */}
                {i === 0 && (
                  <Link
                    to="/missions/$host/$id"
                    params={{ host: r.original.host, id: r.original.mission_id }}
                    aria-label={`Open mission ${r.original.mission_name || r.original.display_name || r.original.mission_id}`}
                    className="absolute inset-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
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
