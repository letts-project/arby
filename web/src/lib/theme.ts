import { readCookie } from './cookies'

export type Theme = 'light' | 'dark'

const KEY = 'arby-theme'

/**
 * resolveInitialTheme picks the startup theme with precedence
 * localStorage > ?theme query > the configured default.
 */
export function resolveInitialTheme(search: string, defaultTheme: Theme): Theme {
  const stored = localStorage.getItem(KEY)
  if (stored === 'light' || stored === 'dark') return stored
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('theme')
  if (q === 'light' || q === 'dark') return q
  return defaultTheme
}

/** applyTheme toggles the .dark class on <html> and persists the choice. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  localStorage.setItem(KEY, theme)
}

/** currentTheme reads the live theme from the <html> class. */
export function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/**
 * configuredDefault reads arby's server-published default theme (the arby_theme
 * cookie set when the server serves index.html, from `--theme`). It is the
 * lowest-precedence startup default — localStorage and ?theme still win. In dev
 * (Vite serves the HTML) the cookie is absent and this returns 'light'.
 */
export function configuredDefault(): Theme {
  return readCookie('arby_theme') === 'dark' ? 'dark' : 'light'
}
