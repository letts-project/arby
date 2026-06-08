import type { ReactNode, HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

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
