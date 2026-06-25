// Post-login redirect handling. The router guard stashes where an unauthenticated
// user was headed (e.g. a shared deep link `/files?file=…&tenant=…`); login then
// sends them there. Persisted in sessionStorage so it also survives the OAuth
// round-trip through the identity provider (where query params are lost).

const KEY = 'fe.postLoginRedirect'

// Only allow same-origin, absolute internal paths — never an external URL or a
// protocol-relative ("//host") one (open-redirect guard).
export function safeRedirect(raw: unknown): string {
  if (typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/files'
}

export function stashRedirect(raw: unknown): void {
  const path = safeRedirect(raw)
  try {
    if (path !== '/files') sessionStorage.setItem(KEY, path)
    else sessionStorage.removeItem(KEY) // no meaningful target -> clear any stale stash
  } catch {
    /* sessionStorage may be unavailable */
  }
}

// Read-and-clear the stashed destination (defaults to /files).
export function takeRedirect(): string {
  try {
    const v = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return safeRedirect(v)
  } catch {
    return '/files'
  }
}
