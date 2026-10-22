import { describe, it, expect } from 'vitest'
import { normalizeSearch, toFilter } from './missionSearch'

describe('missionSearch', () => {
  it('drops empty/unknown params and clamps limit', () => {
    expect(normalizeSearch({ state: 'running', lane: '', bogus: 'x', limit: 9999 })).toEqual({
      state: 'running',
      limit: 200,
    })
  })

  it('validates the state/outcome/order enums', () => {
    expect(normalizeSearch({ state: 'sideways' }).state).toBeUndefined()
    expect(normalizeSearch({ state: 'failed', outcome: 'timeout' })).toEqual({ state: 'failed', outcome: 'timeout' })
    expect(normalizeSearch({ state: 'failed', outcome: 'success' })).toEqual({ state: 'failed' })
    expect(normalizeSearch({ state: 'running', outcome: 'timeout' })).toEqual({ state: 'running' })
    expect(normalizeSearch({ order: 'finished' }).order).toBe('finished')
    expect(normalizeSearch({ order: 'sideways' }).order).toBeUndefined()
  })

  it('maps legacy status/outcome links onto the tabs', () => {
    expect(normalizeSearch({ status: 'running' })).toEqual({ state: 'running' })
    expect(normalizeSearch({ status: 'done', outcome: 'failed' })).toEqual({ state: 'failed', outcome: 'failed' })
    expect(normalizeSearch({ outcome: 'success' })).toEqual({ state: 'succeeded' })
    expect(normalizeSearch({ outcome: 'killed' })).toEqual({ state: 'killed' })
  })

  it('toFilter turns tabs into status/outcome and passes the rest through', () => {
    expect(toFilter({ state: 'failed', host: 's1' })).toEqual({
      status: 'done',
      outcome: 'failed,timeout,crashed,oom,lost',
      host: 's1',
    })
    expect(toFilter({ state: 'failed', outcome: 'oom' })).toEqual({ status: 'done', outcome: 'oom' })
    expect(toFilter({ state: 'succeeded' })).toEqual({ status: 'done', outcome: 'success' })
    expect(toFilter({ lane: 'heavy' })).toEqual({ lane: 'heavy' })
  })
})
