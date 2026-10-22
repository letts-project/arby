import type { ReactElement, ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/** A quick tooltip for an icon-only control; the child must accept a ref. */
export function Tip({
  label,
  side = 'top',
  children,
}: {
  label: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: ReactElement
}) {
  return (
    <TooltipProvider delayDuration={80}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
