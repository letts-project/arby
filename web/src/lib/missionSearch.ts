import type { MissionsFilter } from '@/hooks/useMissions'
import { FAILURE_OUTCOMES, stateQuery, type MissionState } from './missionView'

export interface MissionSearch {
  state?: MissionState
  /** Narrows the `failed` tab to one failure outcome. */
  outcome?: string
  lane?: string
  mission?: string
  order?: 'created' | 'finished'
  host?: string
  limit?: number
}

const STATES = new Set<string>(['running', 'queued', 'succeeded', 'failed', 'killed'])
const FAILURES = new Set<string>(FAILURE_OUTCOMES)

/** legacyState maps the pre-tab `status`/`outcome` params onto a tab. */
function legacyState(status: unknown, outcome: unknown): { state?: MissionState; outcome?: string } {
  if (outcome === 'success') return { state: 'succeeded' }
  if (outcome === 'killed') return { state: 'killed' }
  if (typeof outcome === 'string' && FAILURES.has(outcome)) return { state: 'failed', outcome }
  if (status === 'running' || status === 'queued') return { state: status }
  return {}
}

/**
 * normalizeSearch validates the URL search-params for the missions list: it
 * drops empty/unknown keys, validates the enums, maps legacy `status`/`outcome`
 * links onto the tabs and clamps the limit. Used as the route's `validateSearch`.
 */
export function normalizeSearch(raw: Record<string, unknown>): MissionSearch {
  const s: MissionSearch = {}
  const str = (k: string) => (typeof raw[k] === 'string' && raw[k] !== '' ? (raw[k] as string) : undefined)
  const st = str('state')
  if (st && STATES.has(st)) {
    s.state = st as MissionState
    const oc = str('outcome')
    if (s.state === 'failed' && oc && FAILURES.has(oc)) s.outcome = oc
  } else {
    Object.assign(s, legacyState(raw.status, raw.outcome))
  }
  if (str('lane')) s.lane = raw.lane as string
  if (str('mission')) s.mission = raw.mission as string
  if (raw.order === 'created' || raw.order === 'finished') s.order = raw.order
  if (str('host')) s.host = raw.host as string
  const n = Number(raw.limit)
  if (Number.isFinite(n) && n > 0) s.limit = Math.min(200, Math.floor(n))
  return s
}

/** toFilter maps the URL search to the /api/missions query. */
export function toFilter(s: MissionSearch): MissionsFilter {
  const { state, outcome, ...rest } = s
  return { ...rest, ...stateQuery(state, outcome) }
}
