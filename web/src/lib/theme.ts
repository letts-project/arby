import { readCookie } from './cookies'

/** The user's theme preference. `system` follows the OS `prefers-color-scheme`. */
export type Theme = 'light' | 'dark' | 'system'

const KEY = 'arby-theme'

const SYSTEM_QUERY = '(prefers-color-scheme: dark)'

/** systemPrefersDark reads the OS-level dark preference (false if unsupported). */
function systemPrefersDark(): boolean {
  return window.matchMedia?.(SYSTEM_QUERY).matches ?? false
}

/** effective resolves a preference to the concrete light/dark actually applied. */
function effective(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return theme
}

function isTheme(v: unknown): v is Theme {
  return v === 'light' || v === 'dark' || v === 'system'
}

/**
 * resolveInitialTheme picks the startup preference with precedence
 * localStorage > ?theme query > the configured default.
 */
export function resolveInitialTheme(search: string, defaultTheme: Theme): Theme {
  const stored = localStorage.getItem(KEY)
  if (isTheme(stored)) return stored
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('theme')
  if (isTheme(q)) return q
  return defaultTheme
}

/** applyTheme toggles the .dark class on <html> from the effective theme and
 *  persists the preference (so `system` survives reloads and re-resolves live). */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', effective(theme) === 'dark')
  localStorage.setItem(KEY, theme)
}

/** currentTheme reads the live *effective* theme from the <html> class. Used by
 *  components that mirror what is actually on screen (e.g. the toaster). */
export function currentTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** storedPreference reads the user's saved preference (light/dark/system) — what
 *  the theme switcher shows as selected, as opposed to the effective theme. */
export function storedPreference(): Theme {
  const stored = localStorage.getItem(KEY)
  return isTheme(stored) ? stored : currentTheme()
}

/** watchSystemTheme keeps `system` preference in sync when the OS theme flips
 *  while the tab is open. Call once at startup. */
export function watchSystemTheme(): void {
  window.matchMedia?.(SYSTEM_QUERY).addEventListener?.('change', () => {
    if (localStorage.getItem(KEY) === 'system') applyTheme('system')
  })
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
