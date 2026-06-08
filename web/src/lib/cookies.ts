/**
 * readCookie returns a server-set cookie's value (decoded), or '' when absent.
 * The arby server publishes a few JS-readable cookies on the index.html response
 * (arby_csrf, arby_theme, arby_version); this is the single reader for all of
 * them. A malformed percent-escape never throws — it falls back to the raw
 * match — so a bad cookie value can't crash module evaluation.
 */
export function readCookie(name: string): string {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  if (!m) return ''
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}
