import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-[13px] transition-colors outline-none placeholder:text-faint disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25",
        className
      )}
      {...props}
    />
  )
}

export { Input }
