import { useEffect, useState } from 'react'
import { fmtDuration } from '@/lib/format'
import type { Mission } from '@/lib/types'

/** Renders a mission's duration — live-ticking while running, else duration_ms. */
export function Duration({ mission }: { mission: Pick<Mission, 'status' | 'time_started' | 'duration_ms'> }) {
  const live = mission.status === 'running' && !!mission.time_started
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [live])
  const ms = live ? now - (mission.time_started ?? now) : mission.duration_ms
  return <span className="tabular">{fmtDuration(ms)}</span>
}
