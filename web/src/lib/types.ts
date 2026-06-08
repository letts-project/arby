// TS mirrors of the arby /api wire shapes. Optional fields correspond to Go
// `omitempty` tags (absent when zero), so most are optional here.

export interface MissionFile {
  role?: string
  staging_id: string
  sha256?: string
  size?: number
}

export type MissionStatus = 'queued' | 'running' | 'done' | 'deleting'
export type MissionOutcome = 'success' | 'failed' | 'killed' | 'timeout' | 'crashed' | 'lost' | 'oom'

export interface Mission {
  mission_id: string
  kind?: 'mission' | 'exec'
  lane?: string
  mission_name?: string
  display_name?: string
  group_id?: string
  status: MissionStatus
  outcome?: MissionOutcome
  exit_code?: number
  signal?: string
  fail_reason?: string
  fail_message?: string
  fail_details?: unknown
  return?: unknown
  input?: unknown
  input_fingerprint?: string
  pid?: number
  time_created?: number
  time_started?: number
  time_finished?: number
  duration_ms?: number
  timeout_ms?: number
  truncated_stdout?: boolean
  truncated_stderr?: boolean
  restarted_from?: string
  inputs?: MissionFile[]
  outputs?: Record<string, MissionFile>
}

export interface MergedMission extends Mission {
  host: string
}

/** host id → fan-out failure reason (timeout / reset / HTTP status), shown in
 *  the unavailable-hosts banner so the cause is visible without journalctl. */
export type UnavailableReasons = Record<string, string>

export interface MissionsPage {
  items: MergedMission[]
  next_cursor?: string
  unavailable_hosts?: string[]
  unavailable_reasons?: UnavailableReasons
}

export interface QueueSummary {
  queued: number
  running: number
}

export interface HostStatus {
  id: string
  online: boolean
  /** false → no admin token resolved: health/version only, absent from listings. */
  managed: boolean
  version?: string
  uptime_seconds?: number
  applied_at?: number
  queue_summary: QueueSummary
  labels?: string[]
}

/** One configured host from letts.yaml (GET /api/hosts — no probing). */
export interface HostInfo {
  id: string
  managed: boolean
  labels?: string[]
}

export interface HostsResult {
  hosts: HostInfo[]
}

export interface LaneStatus {
  host: string
  name: string
  queued: number
  running: number
  concurrency: number
  paused: boolean
}

export interface DashboardResult {
  hosts: HostStatus[]
  lanes: LaneStatus[]
  recent_failures: MergedMission[]
  unavailable_hosts?: string[]
  unavailable_reasons?: UnavailableReasons
}

export interface LanesResult {
  lanes: LaneStatus[]
  unavailable_hosts?: string[]
  unavailable_reasons?: UnavailableReasons
}

export interface DugdalesResult {
  hosts: HostStatus[]
  unavailable_hosts?: string[]
  unavailable_reasons?: UnavailableReasons
}

export interface RestartResult {
  mission_id: string
  restarted_from: string
  status: string
}

export interface BulkResult {
  /** Host the action ran on — ids are only unique per host. */
  host: string
  id: string
  ok: boolean
  error?: string
  mission_id?: string
  status?: string
  details?: Record<string, unknown>
}

export interface BulkResponse {
  results: BulkResult[]
}

export interface BulkItem {
  host: string
  id: string
}

export interface ExecDetail extends MergedMission {
  script_preview?: string
  script_truncated?: boolean
  script_staging_id?: string
}

export interface ExecGroupSummary {
  total: number
  success: number
  failed: number
  running: number
  queued: number
}

export interface ExecGroupResult {
  group_id: string
  items: MergedMission[]
  summary: ExecGroupSummary
  unavailable_hosts?: string[]
  unavailable_reasons?: UnavailableReasons
}

/** Raw daemon event — the `data:` payload of the /events SSE relay. */
export interface MissionEvent {
  seq: number
  event: 'queued' | 'running' | 'progress' | 'done' | 'return'
  mission_id?: string
  lane?: string
  mission?: string
  time?: number
  time_created?: number
  time_started?: number
  time_finished?: number
  pid?: number
  value?: number
  message?: string
  outcome?: string
  exit_code?: number
  signal?: string
  fail_reason?: string
  fail_message?: string
  return?: unknown
  duration_ms?: number
}

/** One interleaved output line — the `data:` payload of the /output SSE relay. */
export interface OutputLine {
  t: number
  stream: 'stdout' | 'stderr'
  data: string
}

export interface ApiError {
  error: string
  message: string
  details?: unknown
}
