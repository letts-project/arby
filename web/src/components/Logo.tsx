import { cn } from '@/lib/utils'

/** Arby's yellow sports bag. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 22" aria-hidden className={cn('h-[18px] w-auto', className)}>
      <path d="M8.5 9C8.5 4 19.5 4 19.5 9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <rect x="1.75" y="8.5" width="24.5" height="11.75" rx="5.25" fill="#ffd21a" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 12h14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M17.25 12v2.25" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
