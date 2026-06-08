import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
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

const col = createColumnHelper<MergedMission>()

function IdCell({ id }: { id: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="font-mono text-[12px] text-muted-foreground" title={id}>
        {id.slice(0, 8)}…
      </span>
      <CopyButton value={id} label="Copy mission id" />
    </span>
  )
}

/** Dense, clickable mission grid (TanStack Table). Rows navigate to detail; an
 *  optional selection model adds a leading checkbox column for bulk actions. */
export function MissionsTable({ rows, selection }: { rows: MergedMission[]; selection?: MissionSelection }) {
  const navigate = useNavigate()

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
      col.display({ id: 'actions', header: '', cell: (c) => <MissionRowActions mission={c.row.original} /> }),
    ] as ColumnDef<MergedMission, unknown>[]

    if (!selection) return base

    const selectCol = col.display({
      id: 'select',
      header: () => (
        <span onClick={(e) => e.stopPropagation()}>
          <Checkbox
            aria-label="Select all"
            checked={selection.allSelected ? true : selection.someSelected ? 'indeterminate' : false}
            onCheckedChange={() => selection.toggleAll()}
          />
        </span>
      ),
      cell: (c) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Checkbox
            aria-label="Select mission"
            checked={selection.isSelected(c.row.original)}
            onCheckedChange={() => selection.toggle(c.row.original)}
          />
        </span>
      ),
    }) as ColumnDef<MergedMission, unknown>
    return [selectCol, ...base]
  }, [selection])

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() })

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
        {table.getRowModel().rows.map((r) => {
          const open = () =>
            navigate({
              to: '/missions/$host/$id',
              params: { host: r.original.host, id: r.original.mission_id },
            })
          return (
          <tr
            key={r.id}
            tabIndex={0}
            aria-label={`Open mission ${r.original.mission_name || r.original.display_name || r.original.mission_id}`}
            onClick={open}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                open()
              }
            }}
            className={cn(
              'cursor-pointer border-b transition-colors hover:bg-muted/40 focus:outline-none focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
              selection?.isSelected(r.original) && 'bg-primary/5',
            )}
          >
            {r.getVisibleCells().map((cell) => (
              <td key={cell.id} className="px-3 py-1.5 align-middle">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
          )
        })}
      </tbody>
    </table>
  )
}
