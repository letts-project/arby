// Shared sorting primitives for the display tables. The single home of
// natural-order comparison (Intl.Collator with numeric:true → s2 < s10).

export type SortDir = 'asc' | 'desc'

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function toStr(v: unknown): string {
  return v == null ? '' : String(v)
}

function isEmpty(v: unknown): boolean {
  return v == null || v === ''
}

/**
 * Three-way comparator: numbers numerically (negatives included), booleans
 * false < true, everything else by natural string collation (numeric-aware,
 * case-insensitive). null/undefined collate as "" — empty-last ordering is the
 * caller's concern (see sortBy).
 */
export function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a < b ? -1 : a > b ? 1 : 0
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return a === b ? 0 : a ? 1 : -1
  }
  return collator.compare(toStr(a), toStr(b))
}

/**
 * Stable sort of a COPY of rows by an accessor. Empty values (null/undefined/"")
 * always sort last, regardless of direction; equal keys keep their original
 * order (index tiebreak, so desc doesn't shuffle ties).
 */
export function sortBy<T>(rows: T[], accessor: (row: T) => unknown, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1
  return rows
    .map((row, i) => ({ row, i }))
    .sort((x, y) => {
      const av = accessor(x.row)
      const bv = accessor(y.row)
      const ae = isEmpty(av)
      const be = isEmpty(bv)
      if (ae || be) {
        if (ae && be) return x.i - y.i
        return ae ? 1 : -1 // empty always last
      }
      const cmp = compareValues(av, bv)
      return cmp !== 0 ? sign * cmp : x.i - y.i
    })
    .map((w) => w.row)
}
