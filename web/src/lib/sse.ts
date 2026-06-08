import type { MissionEvent, OutputLine } from './types'

/** parseEvent decodes one /events frame payload (raw daemon event JSON). */
export function parseEvent(data: string): MissionEvent | null {
  try {
    return JSON.parse(data) as MissionEvent
  } catch {
    return null
  }
}

/** parseOutputLine decodes one /output frame payload (NDJSON {t,stream,data}). */
export function parseOutputLine(data: string): OutputLine | null {
  try {
    const o = JSON.parse(data)
    return o && typeof o.data === 'string' ? (o as OutputLine) : null
  } catch {
    return null
  }
}
