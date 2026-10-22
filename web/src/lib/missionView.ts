import type { Mission, MissionOutcome } from './types'

/** Non-success terminal outcomes that count as a failure (killed is operator-initiated). */
export const FAILURE_OUTCOMES: MissionOutcome[] = ['failed', 'timeout', 'crashed', 'oom', 'lost']

export type MissionState = 'running' | 'queued' | 'succeeded' | 'failed' | 'killed'

export const MISSION_STATES: { value: MissionState; label: string }[] = [
  { value: 'running', label: 'Running' },
  { value: 'queued', label: 'Queued' },
  { value: 'failed', label: 'Failed' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'killed', label: 'Killed' },
]

/** stateQuery maps a list tab (and an optional outcome refinement for `failed`)
 *  to the /api status/outcome params. */
export function stateQuery(state?: MissionState, outcome?: string): { status?: string; outcome?: string } {
  switch (state) {
    case 'running':
      return { status: 'running' }
    case 'queued':
      return { status: 'queued' }
    case 'succeeded':
      return { status: 'done', outcome: 'success' }
    case 'killed':
      return { status: 'done', outcome: 'killed' }
    case 'failed':
      return { status: 'done', outcome: outcome ?? FAILURE_OUTCOMES.join(',') }
    default:
      return {}
  }
}

export function missionTitle(m: Pick<Mission, 'mission_name' | 'display_name' | 'mission_id'>): string {
  return m.mission_name || m.display_name || m.mission_id
}

export function isFailure(m: Pick<Mission, 'status' | 'outcome'>): boolean {
  return m.status === 'done' && !!m.outcome && m.outcome !== 'success'
}

/** failureText is the one-line "why" for a non-success mission. */
export function failureText(m: Pick<Mission, 'outcome' | 'fail_message' | 'fail_reason' | 'exit_code' | 'signal'>): string {
  if (m.fail_message) return m.fail_message
  if (m.fail_reason) return m.fail_reason
  if (m.signal) return `${m.outcome ?? 'stopped'} by ${m.signal}`
  if (m.exit_code != null) return `exit code ${m.exit_code}`
  return m.outcome ?? ''
}

// fail_reason values dugdale sets itself; anything else came from the mission's fail event.
const DUGDALE_REASONS = new Set([
  'dugdale_shutdown',
  'duplicate_final_event',
  'event_line_too_large',
  'event_protocol_error',
  'force_delete',
  'input_materialization_failed',
  'killed_by_api',
  'lane_removed',
  'lost',
  'no_event_nonzero_exit',
  'output_collect_failed',
  'output_commit_failed',
  'php_memory_limit',
  'return_too_large',
  'segfault',
  'sigabrt',
  'sigbus',
  'sigfpe',
  'sigill',
  'sigtrap',
  'spawn_failed',
  'success_then_failed_exit',
  'too_many_output_files',
  'unknown_sigkill',
])

/** reportedByMission tells whether the failure text came from the mission's
 *  own fail event (so it is not in its stdout/stderr). */
export function reportedByMission(m: Pick<Mission, 'outcome' | 'fail_reason'>): boolean {
  const r = m.fail_reason
  if (!r || m.outcome === 'timeout') return false
  return !DUGDALE_REASONS.has(r) && !r.startsWith('signal_')
}

function scalar(v: unknown): string {
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

/** inputSummary renders mission input as a compact `key=value key=value` line. */
export function inputSummary(input: unknown): string {
  if (input == null) return ''
  if (typeof input === 'object' && !Array.isArray(input)) {
    return Object.entries(input as Record<string, unknown>)
      .map(([k, v]) => `${k}=${scalar(v)}`)
      .join('  ')
  }
  return scalar(input)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function looksLikeId(s: string): boolean {
  return UUID_RE.test(s.trim())
}
