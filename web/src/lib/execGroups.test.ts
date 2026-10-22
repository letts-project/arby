import { describe, it, expect } from 'vitest'
import { execCommand, groupExecs } from './execGroups'
import type { MergedMission } from './types'

const m = (over: Partial<MergedMission>): MergedMission =>
  ({ host: 's1', mission_id: 'x', status: 'done', outcome: 'success', display_name: 'uptime', ...over }) as MergedMission

describe('groupExecs', () => {
  it('folds group members into one row and keeps single runs apart', () => {
    const runs = groupExecs([
      m({ host: 's10', mission_id: 'a', group_id: 'g', display_name: 'df -h [+2 hosts]' }),
      m({ host: 's2', mission_id: 'b', group_id: 'g', outcome: 'failed', display_name: 'df -h [+2 hosts]' }),
      m({ host: 's1', mission_id: 'c' }),
      m({ host: 's1', mission_id: 'd', group_id: 'g', display_name: 'df -h [+2 hosts]' }),
    ])
    expect(runs.map((r) => r.key)).toEqual(['g:g', 's1/c'])
    expect(runs[0].command).toBe('df -h')
    expect(runs[0].members.map((x) => x.host)).toEqual(['s1', 's2', 's10'])
    expect(runs[0].outcome).toBe('failed')
  })

  it('reports a group as running while any member runs', () => {
    const [r] = groupExecs([
      m({ mission_id: 'a', group_id: 'g', outcome: 'failed' }),
      m({ mission_id: 'b', group_id: 'g', status: 'running', outcome: undefined }),
    ])
    expect(r.status).toBe('running')
    expect(r.durationMs).toBeUndefined()
  })

  it('strips only the CLI host-count suffix', () => {
    expect(execCommand(m({ display_name: 'echo "[+1 hosts]" [+2 hosts]' }))).toBe('echo "[+1 hosts]"')
  })
})
