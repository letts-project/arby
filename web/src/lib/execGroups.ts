import type { MergedMission, MissionOutcome, MissionStatus } from './types'

/** One row of the exec history: a single run, or every host of a group run. */
export interface ExecRun {
  key: string
  groupId?: string
  command: string
  members: MergedMission[]
  /** The aggregate state, worst member first. */
  status: MissionStatus
  outcome?: MissionOutcome
  timeCreated?: number
  durationMs?: number
}

const HOSTS_SUFFIX = /\s*\[\+\d+ hosts?\]$/

/** execCommand is the command line without the CLI's `[+N hosts]` suffix. */
export function execCommand(m: Pick<MergedMission, 'display_name' | 'mission_name' | 'mission_id'>): string {
  return (m.display_name || m.mission_name || m.mission_id).replace(HOSTS_SUFFIX, '')
}

const RANK: Record<string, number> = { running: 0, queued: 1, failed: 2, crashed: 2, oom: 2, lost: 2, timeout: 3, killed: 4, success: 5 }

function rank(m: MergedMission): number {
  if (m.status === 'running' || m.status === 'queued') return RANK[m.status]
  return RANK[m.outcome ?? 'success'] ?? 2
}

/** groupExecs folds the members of a group run into one row, at the position
 *  of its newest member; ungrouped runs stay one row each. */
export function groupExecs(items: MergedMission[]): ExecRun[] {
  const runs: ExecRun[] = []
  const byGroup = new Map<string, ExecRun>()
  for (const m of items) {
    const existing = m.group_id ? byGroup.get(m.group_id) : undefined
    if (existing) {
      existing.members.push(m)
      continue
    }
    const run: ExecRun = { key: m.group_id ? `g:${m.group_id}` : `${m.host}/${m.mission_id}`, groupId: m.group_id, command: execCommand(m), members: [m], status: m.status }
    runs.push(run)
    if (m.group_id) byGroup.set(m.group_id, run)
  }
  for (const r of runs) {
    r.members.sort((a, b) => a.host.localeCompare(b.host, undefined, { numeric: true }))
    const worst = r.members.reduce((w, m) => (rank(m) < rank(w) ? m : w))
    r.status = worst.status
    r.outcome = worst.outcome
    r.timeCreated = Math.min(...r.members.map((m) => m.time_created ?? Infinity))
    const durations = r.members.map((m) => m.duration_ms).filter((d): d is number => d != null)
    r.durationMs = durations.length === r.members.length ? Math.max(...durations) : undefined
  }
  return runs
}
