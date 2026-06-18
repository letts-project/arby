import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTableSort } from './useTableSort'

interface Row {
  host: string
  queued: number
}
const rows: Row[] = [
  { host: 's10', queued: 3 },
  { host: 's2', queued: 1 },
  { host: 's1', queued: 2 },
]
const accessors = {
  host: (r: Row) => r.host,
  queued: (r: Row) => r.queued,
}

function setup(initial = { key: 'host', dir: 'asc' as const }) {
  return renderHook(() => useTableSort<Row>(accessors, initial))
}

describe('useTableSort', () => {
  it('starts at the provided initial sort', () => {
    const { result } = setup()
    expect(result.current.sort).toEqual({ key: 'host', dir: 'asc' })
  })

  it('sorted applies the active column/direction (natural)', () => {
    const { result } = setup()
    expect(result.current.sorted(rows).map((r) => r.host)).toEqual(['s1', 's2', 's10'])
  })

  it('toggling the active column flips asc -> desc -> asc', () => {
    const { result } = setup()
    act(() => result.current.toggle('host'))
    expect(result.current.sort).toEqual({ key: 'host', dir: 'desc' })
    expect(result.current.sorted(rows).map((r) => r.host)).toEqual(['s10', 's2', 's1'])
    act(() => result.current.toggle('host'))
    expect(result.current.sort).toEqual({ key: 'host', dir: 'asc' })
  })

  it('toggling a different column switches to it ascending', () => {
    const { result } = setup()
    act(() => result.current.toggle('queued'))
    expect(result.current.sort).toEqual({ key: 'queued', dir: 'asc' })
    expect(result.current.sorted(rows).map((r) => r.queued)).toEqual([1, 2, 3])
  })
})
