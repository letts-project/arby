import { Loader2 } from 'lucide-react'
import { useInteractionLocked } from '@/lib/interactionLock'

/** Whether a polled list is refreshing now, or holding still for the user
 *  (`held`: scrolled away from the top). */
export function LiveState({ fetching, held = false }: { fetching: boolean; held?: boolean }) {
  const locked = useInteractionLocked()
  if (locked || held) return <span className="text-[12px] text-faint">updates paused</span>
  if (fetching) return <Loader2 className="size-3.5 animate-spin self-center text-faint" />
  return null
}
