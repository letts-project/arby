import { useRef, useState } from 'react'

export interface CursorPager {
  hasPrev: boolean
  hasNext: boolean
  goNext: () => void
  goPrev: () => void
  reset: () => void
}

/**
 * useCursorPager drives opaque-cursor pagination with a Prev that never leaves
 * the SPA. It keeps a stack of visited cursors in a ref — the list route stays
 * mounted across search-param changes, so the ref persists. Prev is disabled
 * when the stack is empty (e.g. a deep-linked ?cursor= URL with no in-app
 * history), instead of falling through to window.history.back(). Call reset()
 * when filters change (the page returns to 1).
 */
export function useCursorPager(
  currentCursor: string | undefined,
  nextCursor: string | undefined,
  go: (cursor: string | undefined) => void,
): CursorPager {
  const stack = useRef<(string | undefined)[]>([])
  const [depth, setDepth] = useState(0)
  return {
    hasPrev: depth > 0,
    hasNext: !!nextCursor,
    goNext: () => {
      if (!nextCursor) return
      stack.current.push(currentCursor)
      setDepth(stack.current.length)
      go(nextCursor)
    },
    goPrev: () => {
      if (stack.current.length === 0) return
      const prev = stack.current.pop()
      setDepth(stack.current.length)
      go(prev)
    },
    reset: () => {
      stack.current = []
      setDepth(0)
    },
  }
}
