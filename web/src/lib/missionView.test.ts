import { describe, it, expect } from 'vitest'
import { reportedByMission } from './missionView'

describe('reportedByMission', () => {
  it('treats explicit and custom reasons as the mission’s own fail event', () => {
    expect(reportedByMission({ outcome: 'failed', fail_reason: 'explicit' })).toBe(true)
    expect(reportedByMission({ outcome: 'failed', fail_reason: 'upstream_error' })).toBe(true)
  })

  it('treats reasons dugdale sets itself as detected by dugdale', () => {
    expect(reportedByMission({ outcome: 'failed', fail_reason: 'no_event_nonzero_exit' })).toBe(false)
    expect(reportedByMission({ outcome: 'failed', fail_reason: 'signal_USR1' })).toBe(false)
    expect(reportedByMission({ outcome: 'killed', fail_reason: 'killed_by_api' })).toBe(false)
    expect(reportedByMission({ outcome: 'timeout' })).toBe(false)
  })
})
