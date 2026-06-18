import { describe, it, expect } from 'vitest'
import { compareValues, sortBy } from './sort'

describe('compareValues', () => {
  it('orders strings naturally (s2 < s10 < s100)', () => {
    expect(compareValues('s2', 's10')).toBeLessThan(0)
    expect(compareValues('s10', 's100')).toBeLessThan(0)
    expect(compareValues('s100', 's2')).toBeGreaterThan(0)
  })

  it('compares numbers numerically, including negatives', () => {
    expect(compareValues(2, 10)).toBeLessThan(0)
    expect(compareValues(10, 2)).toBeGreaterThan(0)
    expect(compareValues(5, 5)).toBe(0)
    expect(compareValues(-10, -5)).toBeLessThan(0)
  })

  it('orders booleans false < true', () => {
    expect(compareValues(false, true)).toBeLessThan(0)
    expect(compareValues(true, false)).toBeGreaterThan(0)
    expect(compareValues(true, true)).toBe(0)
  })

  it('is case-insensitive (base sensitivity)', () => {
    expect(compareValues('Alpha', 'alpha')).toBe(0)
  })

  it('orders cyrillic alphabetically', () => {
    expect(compareValues('а', 'б')).toBeLessThan(0)
  })
})

describe('sortBy', () => {
  const rows = [{ n: 's10' }, { n: 's2' }, { n: 's1' }]

  it('sorts ascending by accessor (natural)', () => {
    expect(sortBy(rows, (r) => r.n, 'asc').map((r) => r.n)).toEqual(['s1', 's2', 's10'])
  })

  it('sorts descending by accessor', () => {
    expect(sortBy(rows, (r) => r.n, 'desc').map((r) => r.n)).toEqual(['s10', 's2', 's1'])
  })

  it('does not mutate the input array', () => {
    const input = [{ n: 'b' }, { n: 'a' }]
    sortBy(input, (r) => r.n, 'asc')
    expect(input.map((r) => r.n)).toEqual(['b', 'a'])
  })

  it('keeps empty values (null/undefined/"") last in both directions', () => {
    const data = [{ v: 'b' }, { v: null }, { v: 'a' }, { v: undefined }, { v: '' }]
    const asc = sortBy(data, (r) => r.v, 'asc').map((r) => r.v)
    expect(asc.slice(0, 2)).toEqual(['a', 'b'])
    expect(asc.slice(2).every((v) => v == null || v === '')).toBe(true)

    const desc = sortBy(data, (r) => r.v, 'desc').map((r) => r.v)
    expect(desc.slice(0, 2)).toEqual(['b', 'a'])
    expect(desc.slice(2).every((v) => v == null || v === '')).toBe(true)
  })

  it('is stable — equal keys keep their original order', () => {
    const data = [
      { k: 1, id: 'a' },
      { k: 1, id: 'b' },
      { k: 0, id: 'c' },
      { k: 1, id: 'd' },
    ]
    expect(sortBy(data, (r) => r.k, 'asc').map((r) => r.id)).toEqual(['c', 'a', 'b', 'd'])
  })
})
