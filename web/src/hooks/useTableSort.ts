import { useCallback, useState } from 'react'
import { sortBy, type SortDir } from '@/lib/sort'

export interface SortState {
  key: string
  dir: SortDir
}

export interface TableSort<T> {
  sort: SortState
  toggle: (key: string) => void
  sorted: (rows: T[]) => T[]
}

/**
 * Client-side sort state for the display tables. `accessors` maps a column key
 * to its value extractor; `initial` is the default column and direction.
 * toggle() flips direction on the active column and switches to ascending on
 * any other column.
 */
export function useTableSort<T>(
  accessors: Record<string, (row: T) => unknown>,
  initial: SortState,
): TableSort<T> {
  const [sort, setSort] = useState<SortState>(initial)

  const toggle = useCallback((key: string) => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    )
  }, [])

  const sorted = (rows: T[]): T[] => {
    const accessor = accessors[sort.key]
    return accessor ? sortBy(rows, accessor, sort.dir) : rows
  }

  return { sort, toggle, sorted }
}
