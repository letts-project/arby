import { useCallback, useState } from 'react'

function load(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    const ids: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function save(key: string, ids: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...ids]))
  } catch {
    /* private mode or storage disabled: the choice just isn't remembered */
  }
}

/** A set of expanded ids, remembered in this browser under `key`. */
export function useExpanded(key: string) {
  const [expanded, setExpanded] = useState(() => load(key))
  const update = useCallback(
    (next: Set<string>) => {
      setExpanded(next)
      save(key, next)
    },
    [key],
  )
  const toggle = useCallback(
    (id: string) => {
      const next = new Set(expanded)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      update(next)
    },
    [expanded, update],
  )
  const setAll = useCallback((ids: string[]) => update(new Set(ids)), [update])
  return { expanded, toggle, setAll }
}
