// Copyright (C) 2026 James Hickman
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

// Post-login redirect handling. The router guard stashes where an unauthenticated
// user was headed (e.g. a shared deep link `/files?file=…&tenant=…`); login then
// sends them there. Persisted in sessionStorage so it also survives the OAuth
// round-trip through the identity provider (where query params are lost).

const KEY = 'fe.postLoginRedirect'

// Only allow same-origin, absolute internal paths — never an external URL or a
// protocol-relative ("//host") one (open-redirect guard).
export function safeRedirect(raw: unknown): string {
  if (typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/dashboard'
}

export function stashRedirect(raw: unknown): void {
  const path = safeRedirect(raw)
  try {
    if (path !== '/dashboard') sessionStorage.setItem(KEY, path)
    else sessionStorage.removeItem(KEY) // no meaningful target -> clear any stale stash
  } catch {
    /* sessionStorage may be unavailable */
  }
}

// Read-and-clear the stashed destination (defaults to the dashboard landing).
export function takeRedirect(): string {
  try {
    const v = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return safeRedirect(v)
  } catch {
    return '/dashboard'
  }
}

// Drop any stashed destination. Called on sign-out: the stash is where the
// PREVIOUS user was headed, and replaying it into the next person's session
// sends them somewhere they never asked for — possibly a deep link naming a
// file that was never theirs.
export function clearRedirect(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* sessionStorage may be unavailable */
  }
}
