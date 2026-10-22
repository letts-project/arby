import { useCallback, useRef, useState } from 'react'

/** A scroll container ref plus whether it sits at (near) the top. */
export function useScrollTop(threshold = 48) {
  const ref = useRef<HTMLDivElement>(null)
  const [atTop, setAtTop] = useState(true)
  const onScroll = useCallback(() => {
    const el = ref.current
    if (el) setAtTop(el.scrollTop < threshold)
  }, [threshold])
  const toTop = useCallback(() => {
    if (ref.current) ref.current.scrollTop = 0
    setAtTop(true)
  }, [])
  return { ref, atTop, onScroll, toTop }
}
