import { useEffect, useRef, type RefObject } from 'react'
import { Loader2 } from 'lucide-react'

/** The end of an infinite list: loads the next page as it nears the viewport
 *  of `root`, and says when everything is loaded. */
export function InfiniteTail({
  root,
  hasNextPage,
  isFetchingNextPage,
  isError,
  fetchNextPage,
  loaded,
}: {
  root: RefObject<HTMLElement | null>
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isError: boolean
  fetchNextPage: () => void
  loaded: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !hasNextPage || isFetchingNextPage || isError) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) fetchNextPage()
      },
      { root: root.current, rootMargin: '0px 0px 600px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [root, hasNextPage, isFetchingNextPage, isError, fetchNextPage])

  return (
    <div ref={ref} className="flex h-12 items-center gap-2 px-5 text-muted-foreground">
      {isFetchingNextPage ? (
        <>
          <Loader2 className="size-3.5 animate-spin" />
          Loading more…
        </>
      ) : isError && hasNextPage ? (
        <>
          <span className="text-status-failed">Couldn’t load more.</span>
          <button type="button" onClick={fetchNextPage} className="underline underline-offset-4 hover:text-foreground">
            Try again
          </button>
        </>
      ) : hasNextPage ? (
        <button type="button" onClick={fetchNextPage} className="underline underline-offset-4 hover:text-foreground">
          Load more
        </button>
      ) : (
        <span>{loaded}, that’s all.</span>
      )}
    </div>
  )
}
