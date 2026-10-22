import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useHosts } from '@/hooks/useHosts'
import { apiGet } from '@/lib/api'
import { looksLikeId } from '@/lib/missionView'
import type { MergedMission } from '@/lib/types'

/** findMission asks every managed dugdale for the id and resolves with the
 *  first one that has it. */
async function findMission(hosts: string[], id: string): Promise<MergedMission | null> {
  try {
    return await Promise.any(
      hosts.map((h) => apiGet<MergedMission>(`/api/missions/${encodeURIComponent(h)}/${encodeURIComponent(id)}`)),
    )
  } catch {
    return null
  }
}

/** Top-bar search: a pasted mission/exec id opens it directly, anything else
 *  filters the missions list by name. `/` focuses it. */
export function GlobalSearch() {
  const navigate = useNavigate()
  const { data: hostsData } = useHosts()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
      e.preventDefault()
      ref.current?.focus()
      ref.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = async () => {
    const v = q.trim()
    if (!v) return
    if (!looksLikeId(v)) {
      void navigate({ to: '/missions', search: { mission: v } })
      ref.current?.blur()
      return
    }
    setBusy(true)
    const hosts = (hostsData?.hosts ?? []).filter((h) => h.managed).map((h) => h.id)
    const m = await findMission(hosts, v.toLowerCase())
    setBusy(false)
    if (!m) {
      toast.error('Mission not found', { description: `No reachable dugdale has ${v}.` })
      return
    }
    setQ('')
    ref.current?.blur()
    void navigate({
      to: m.kind === 'exec' ? '/exec/$host/$id' : '/missions/$host/$id',
      params: { host: m.host, id: m.mission_id },
    })
  }

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      {busy ? (
        <Loader2 className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 animate-spin text-faint" />
      ) : (
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-faint" />
      )}
      <input
        ref={ref}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setQ('')
            ref.current?.blur()
          }
        }}
        placeholder="Mission id or name"
        aria-label="Find a mission by id or name"
        className="h-7 w-40 rounded-md border border-input xl:w-64 bg-background pr-6 pl-7 text-[13px] outline-none placeholder:text-faint focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 font-sans text-[11px] text-faint">/</kbd>
    </form>
  )
}
