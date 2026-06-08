import { useMemo } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { StatusBadge } from './StatusBadge'
import { HostChip } from './HostChip'
import { Duration } from './Duration'
import { MissionRowActions } from './MissionRowActions'
import { fmtAgo } from '@/lib/format'
import type { MergedMission } from '@/lib/types'

const col = createColumnHelper<MergedMission>()

/** Exec history grid — command-centric, with a group_id link. Rows navigate to
 *  exec detail. Reuses MissionRowActions (exec ids are mission ids). */
export function ExecTable({ rows }: { rows: MergedMission[] }) {
  const navigate = useNavigate()
  const columns = useMemo(
    () => [
      col.accessor('status', { header: 'Status', cell: (c) => <StatusBadge mission={c.row.original} /> }),
      col.accessor('host', { header: 'Host', cell: (c) => <HostChip host={c.getValue()} /> }),
      col.display({
        id: 'command',
        header: 'Command',
        cell: (c) => {
          const m = c.row.original
          return (
            <span className="block max-w-[28rem] truncate font-mono text-[12px]">
              {m.display_name || m.mission_name || m.mission_id}
            </span>
          )
        },
      }),
      col.accessor('group_id', {
        header: 'Group',
        cell: (c) => {
          const g = c.getValue()
          if (!g) return <span className="text-muted-foreground">—</span>
          return (
            <Link
              to="/exec/groups/$groupId"
              params={{ groupId: g }}
              onClick={(e) => e.stopPropagation()}
              className="font-mono text-[11px] text-primary hover:underline"
            >
              {g.slice(0, 8)}…
            </Link>
          )
        },
      }),
      col.display({
        id: 'exit',
        header: 'Exit',
        cell: (c) => {
          const m = c.row.original
          const v = m.exit_code != null ? String(m.exit_code) : m.signal ? `sig ${m.signal}` : '—'
          return <span className="font-mono tabular text-muted-foreground">{v}</span>
        },
      }),
      col.display({ id: 'duration', header: 'Duration', cell: (c) => <Duration mission={c.row.original} /> }),
      col.accessor('time_created', {
        header: 'Created',
        cell: (c) => <span className="whitespace-nowrap text-muted-foreground">{fmtAgo(c.getValue())}</span>,
      }),
      col.display({ id: 'actions', header: '', cell: (c) => <MissionRowActions mission={c.row.original} /> }),
    ],
    [],
  )
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
            navigate({ to: '/exec/$host/$id', params: { host: r.original.host, id: r.original.mission_id } })
          return (
            <tr
              key={r.id}
              tabIndex={0}
              aria-label={`Open exec ${r.original.display_name || r.original.mission_id}`}
              onClick={open}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  open()
                }
              }}
              className="cursor-pointer border-b transition-colors hover:bg-muted/40 focus:outline-none focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
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
