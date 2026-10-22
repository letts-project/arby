import { FAILURE_OUTCOMES, stateQuery, type MissionState } from './missionView'

export interface ExecFilter {
  status?: string
  outcome?: string
  group_id?: string
  host?: string
  order?: string
  limit?: number
}

export interface ExecSearch {
  state?: MissionState
  outcome?: string
  group_id?: string
  order?: 'created' | 'finished'
  host?: string
  limit?: number
}

const STATES = new Set<string>(['running', 'queued', 'succeeded', 'failed', 'killed'])
const FAILURES = new Set<string>(FAILURE_OUTCOMES)

/** Validates the exec list URL search (drop empties, validate enums, clamp limit). */
export function normalizeExecSearch(raw: Record<string, unknown>): ExecSearch {
  const s: ExecSearch = {}
  const str = (k: string) => (typeof raw[k] === 'string' && raw[k] !== '' ? (raw[k] as string) : undefined)
  const st = str('state')
  if (st && STATES.has(st)) {
    s.state = st as MissionState
    const oc = str('outcome')
    if (s.state === 'failed' && oc && FAILURES.has(oc)) s.outcome = oc
  }
  if (str('group_id')) s.group_id = raw.group_id as string
  if (raw.order === 'created' || raw.order === 'finished') s.order = raw.order
  if (str('host')) s.host = raw.host as string
  const n = Number(raw.limit)
  if (Number.isFinite(n) && n > 0) s.limit = Math.min(200, Math.floor(n))
  return s
}

/** Maps the exec URL search to the /api/exec query. */
export function toExecFilter(s: ExecSearch): ExecFilter {
  const { state, outcome, ...rest } = s
  return { ...rest, ...stateQuery(state, outcome) }
}
