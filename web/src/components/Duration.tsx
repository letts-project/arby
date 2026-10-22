import { useEffect, useState } from 'react'
import { fmtDuration } from '@/lib/format'
import type { Mission } from '@/lib/types'

/** A mission's run time: live while running, time spent waiting while queued,
 *  else duration_ms. */
export function Duration({
  mission,
}: {
  mission: Pick<Mission, 'status' | 'time_started' | 'time_created' | 'duration_ms'>
}) {
  const running = mission.status === 'running' && !!mission.time_started
  const queued = mission.status === 'queued' && !!mission.time_created
  const live = running || queued
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [live])
  if (queued) {
    return <span className="text-muted-foreground">waiting {fmtDuration(now - (mission.time_created ?? now))}</span>
  }
  const ms = running ? now - (mission.time_started ?? now) : mission.duration_ms
  return <span>{fmtDuration(ms)}</span>
}
