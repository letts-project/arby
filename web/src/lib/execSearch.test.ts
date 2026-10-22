import { describe, it, expect } from 'vitest'
import { normalizeExecSearch, toExecFilter } from './execSearch'

describe('execSearch', () => {
  it('keeps group_id and valid enums, drops junk, clamps limit', () => {
    expect(normalizeExecSearch({ group_id: 'g1', state: 'running', junk: 'x', limit: 5000 })).toEqual({
      group_id: 'g1',
      state: 'running',
      limit: 200,
    })
    expect(normalizeExecSearch({ state: 'failed', outcome: 'nope' })).toEqual({ state: 'failed' })
  })

  it('toExecFilter maps the tab and passes the rest through, including host', () => {
    expect(toExecFilter({ state: 'failed', group_id: 'g1', host: 's2' })).toEqual({
      status: 'done',
      outcome: 'failed,timeout,crashed,oom,lost',
      group_id: 'g1',
      host: 's2',
    })
  })
})
