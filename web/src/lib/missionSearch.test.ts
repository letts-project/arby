import { describe, it, expect } from 'vitest'
import { normalizeSearch, toFilter } from './missionSearch'

describe('missionSearch', () => {
  it('drops empty/unknown params and clamps limit', () => {
    expect(normalizeSearch({ status: 'running', lane: '', bogus: 'x', limit: 9999 })).toEqual({
      status: 'running',
      limit: 200,
    })
  })

  it('validates the status/outcome/order enums', () => {
    expect(normalizeSearch({ status: 'sideways' }).status).toBeUndefined()
    expect(normalizeSearch({ outcome: 'failed' }).outcome).toBe('failed')
    expect(normalizeSearch({ order: 'finished' }).order).toBe('finished')
    expect(normalizeSearch({ order: 'sideways' }).order).toBeUndefined()
  })

  it('toFilter passes every filter through, including host', () => {
    expect(toFilter({ status: 'done', outcome: 'failed', cursor: 'abc', host: 's1' })).toEqual({
      status: 'done',
      outcome: 'failed',
      cursor: 'abc',
      host: 's1',
    })
  })
})
