import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { routeTree } from './routeTree.gen'
import { queryClient } from './lib/queryClient'
import { resolveInitialTheme, applyTheme, configuredDefault } from './lib/theme'

// Self-hosted type system (bundled by Vite — offline-safe for an internal tool).
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './index.css'

// Apply the theme before first paint to avoid a flash. Precedence:
// localStorage > ?theme > the server-configured default (arby --theme).
applyTheme(resolveInitialTheme(window.location.search, configuredDefault()))

const router = createRouter({ routeTree, defaultPreload: 'intent' })
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
)
