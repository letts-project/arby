import { useSyncExternalStore } from 'react'

// A tiny ref-counted lock shared across the app. While any mission/exec action
// menu or confirm dialog is open, the list queries pause their polling — so a
// background refetch can't reorder the table and yank the open menu (or a
// half-confirmed Kill/Delete modal) out from under the user mid-action.

let count = 0
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

/**
 * acquireInteractionLock increments the lock and returns an idempotent release.
 * Designed to drop straight into a useEffect cleanup:
 *   useEffect(() => { if (open) return acquireInteractionLock() }, [open])
 */
export function acquireInteractionLock(): () => void {
  count += 1
  emit()
  let released = false
  return () => {
    if (released) return
    released = true
    count = Math.max(0, count - 1)
    emit()
  }
}

/** useInteractionLocked re-renders the caller whenever the lock count crosses
 *  between 0 and non-zero. True means "something interactive is open — pause". */
export function useInteractionLocked(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => count > 0,
    () => false,
  )
}
