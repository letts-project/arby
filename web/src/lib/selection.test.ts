import { describe, it, expect } from 'vitest'
import { toBulkItems, selectionKey } from './selection'
import type { MergedMission } from './types'

const row = (host: string, id: string): MergedMission =>
  ({ host, mission_id: id, status: 'done' }) as MergedMission

describe('selection', () => {
  it('selectionKey is host-qualified (missions are (host,id))', () => {
    expect(selectionKey({ host: 's1', mission_id: 'a' })).toBe('s1/a')
  })

  it('toBulkItems maps a selection set to {host,id}[]', () => {
    const rows = [row('s1', 'a'), row('s2', 'b'), row('s1', 'c')]
    const items = toBulkItems(rows, new Set(['s1/a', 's2/b']))
    expect(items).toEqual([
      { host: 's1', id: 'a' },
      { host: 's2', id: 'b' },
    ])
  })
})
