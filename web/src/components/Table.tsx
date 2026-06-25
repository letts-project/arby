import type { ReactNode, HTMLAttributes } from 'react'
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SortState } from '@/hooks/useTableSort'

/**
 * Dense, non-interactive display-table primitives (Dashboard / Lanes / Dugdales).
 * The interactive missions/exec grids use TanStack Table instead.
 */
export function DTable({ children, className }: { children: ReactNode; className?: string }) {
  return <table className={cn('w-full border-collapse text-[13px]', className)}>{children}</table>
}

export function DThead({ children }: { children: ReactNode }) {
  return (
    <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">{children}</thead>
  )
}

export function DTh({ children, className, ...rest }: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn('border-b px-3 py-1.5 text-left font-medium whitespace-nowrap', className)} {...rest}>
      {children}
    </th>
  )
}

/** A sortable column header for DTable. Renders the standard DTh styling with a
 *  clickable button (keyboard-accessible) and a direction indicator; the active
 *  column carries aria-sort for screen readers. Wire `sort`/`onToggle` from
 *  useTableSort. Pass `className` (e.g. text-right) for numeric columns. */
export function SortableDTh({
  sortKey,
  sort,
  onToggle,
  children,
  className,
}: {
  sortKey: string
  sort: SortState
  onToggle: (key: string) => void
  children: ReactNode
  className?: string
}) {
  const active = sort.key === sortKey
  const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
  const Icon = active ? (sort.dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown
  return (
    <th
      aria-sort={ariaSort}
      className={cn('border-b px-3 py-1.5 text-left font-medium whitespace-nowrap', className)}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn(
          '-mx-1 inline-flex cursor-pointer items-center gap-1 rounded px-1 transition-colors hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          active && 'text-foreground',
        )}
      >
        <span>{children}</span>
        <Icon className={cn('size-3 shrink-0', active ? 'opacity-100' : 'opacity-40')} aria-hidden />
      </button>
    </th>
  )
}

export function DTr({ children, className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('border-b last:border-0 transition-colors hover:bg-muted/40', className)} {...rest}>
      {children}
    </tr>
  )
}

export function DTd({ children, className, ...rest }: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-3 py-1.5 align-middle', className)} {...rest}>
      {children}
    </td>
  )
}
