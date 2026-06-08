import type { ReactNode } from 'react'
import { useRouter, useCanGoBack } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

/**
 * Back navigation that returns to wherever you came from within the SPA (e.g.
 * Dashboard vs Dugdales for a config page). Falls back to a fixed link when
 * there is no in-app history (deep link / fresh tab) so it never leaves the SPA.
 */
export function BackButton({ fallback }: { fallback: ReactNode }) {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  if (!canGoBack) return <>{fallback}</>
  return (
    <button
      type="button"
      onClick={() => router.history.back()}
      className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      Back
    </button>
  )
}
