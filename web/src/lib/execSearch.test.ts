import { describe, it, expect } from 'vitest'
import { normalizeExecSearch, toExecFilter } from './execSearch'

describe('execSearch', () => {
  it('keeps group_id and valid enums, drops junk, clamps limit', () => {
    expect(normalizeExecSearch({ group_id: 'g1', status: 'running', junk: 'x', limit: 5000 })).toEqual({
      group_id: 'g1',
      status: 'running',
      limit: 200,
    })
    expect(normalizeExecSearch({ outcome: 'nope' }).outcome).toBeUndefined()
  })

  it('toExecFilter passes every filter through, including host', () => {
    expect(toExecFilter({ status: 'done', group_id: 'g1', host: 's2', cursor: 'c' })).toEqual({
      status: 'done',
      group_id: 'g1',
      host: 's2',
      cursor: 'c',
    })
  })
})
