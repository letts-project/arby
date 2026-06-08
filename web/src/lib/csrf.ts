import { readCookie } from './cookies'

/**
 * csrfToken reads the arby_csrf cookie (set by the server when it serves
 * index.html). The SPA echoes it as X-CSRF-Token on every mutation so the
 * double-submit check passes.
 */
export function csrfToken(): string {
  return readCookie('arby_csrf')
}
