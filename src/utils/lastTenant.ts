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

/**
 * "Which workspace was THIS PERSON last in?" — the hint that lets the shared
 * sign-in origin send a returning user straight through instead of asking
 * again.
 *
 * **PER USER, not per browser.** It used to be one name for the whole machine,
 * which made it a trap rather than a convenience: user A signs out of workspace
 * X, user B signs in, and B's session is aimed at X — a workspace B may not be
 * in at all. The bridge then issues B's token for a tenant B *is* in and refuses
 * every request naming X, so the sign-in succeeds and the app is dead on
 * arrival ("not a member of the requested tenant"). Keyed by user, A's memory
 * is waiting for A the next time A signs in, and is invisible to B.
 *
 * **This is a hint, never a credential.** Nothing may be authorised on the
 * strength of it. It names a tenant the user may no longer belong to, may be
 * edited freely in devtools, and is read by an origin that has not yet
 * authenticated anyone. Every consumer re-checks the name against the tenants
 * the user's token actually carries and falls back when it does not match.
 *
 * **The user is not stored, only a hash of it.** Usernames here are email
 * addresses, and a plain `fe_last_tenant:alice@example.com` in localStorage
 * hands the address to anything that can read the store — and to anyone glancing
 * at devtools on a shared machine. The hash is deterministic so the lookup
 * works, which necessarily means someone who already has a candidate address can
 * confirm it: this OBSCURES the address, it does not protect it. That is the
 * right trade for a routing hint, and it is why nothing more sensitive than a
 * tenant name is kept here.
 *
 * TWO STORES, ON PURPOSE.
 *
 * The cookie is the one that matters: scoped to the parent domain, it is
 * readable by `login.example.com` AND by every tenant subdomain, so switching
 * workspace inside the app updates it too — not only a trip through the login
 * page. localStorage cannot do that, being origin-scoped.
 *
 * But a cookie on a PUBLIC SUFFIX is rejected by the browser, and `ngrok.io` is
 * one — so on the dev tunnels `filenginetest.ngrok.io` and `someco.ngrok.io`
 * are separate registrable domains and no shared cookie is possible. Without a
 * fallback, dev would silently behave as though every sign-in were the first,
 * which reads as a bug in the feature rather than a property of the domain.
 *
 * So: write both, prefer the cookie on read. In production the cookie carries
 * it; in dev localStorage keeps the login origin's own memory working.
 */

import { parentCookieDomain } from '@/utils/tenantHost'

const KEY = 'fe_last_tenant'
// Long enough that it is still there next time someone signs in, short enough
// that a stale name expires rather than lingering for years.
const MAX_AGE_DAYS = 180
// A browser is used by a handful of people at most. The cap bounds the cookie
// (which travels on every request to the domain) and quietly forgets whoever
// has not signed in for longest.
const MAX_USERS = 8

/** [hashed user, tenant], most recently recorded first. */
type Entry = [string, string]

/**
 * FNV-1a, 64-bit. Deterministic, dependency-free, and synchronous — which
 * `crypto.subtle` is not, and this is read on the path that decides where a
 * sign-in is aimed.
 *
 * Not a security boundary (see the header): its job is to keep email addresses
 * out of plain sight in the browser's storage. 64 bits is far more than enough
 * to keep the handful of accounts on one machine distinct, and a collision
 * would cost nothing anyway — the hint is checked against the token's tenants
 * before it is honoured, so the worst case is landing on your first workspace.
 */
function userKey(user: string): string {
  const s = user.trim().toLowerCase()
  let h = 0xcbf29ce484222325n
  for (let i = 0; i < s.length; i++) {
    h = BigInt.asUintN(64, (h ^ BigInt(s.charCodeAt(i))) * 0x100000001b3n)
  }
  return h.toString(16).padStart(16, '0')
}

function readCookie(): string | null {
  if (typeof document === 'undefined') return null
  for (const part of document.cookie.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === KEY) return decodeURIComponent(v.join('=')) || null
  }
  return null
}

function writeCookie(value: string): boolean {
  if (typeof document === 'undefined') return false
  const domain = parentCookieDomain()
  if (!domain) return false
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:'
  document.cookie =
    `${KEY}=${encodeURIComponent(value)}; Domain=${domain}; Path=/; ` +
    `Max-Age=${MAX_AGE_DAYS * 24 * 60 * 60}; SameSite=Lax${secure ? '; Secure' : ''}`
  // Read it back rather than predicting. A public-suffix parent (".ngrok.io")
  // is refused silently by the browser, and no amount of string inspection here
  // could tell us that without shipping a Public Suffix List.
  return readCookie() === value
}

// Anything unreadable is treated as "nothing remembered" rather than repaired:
// this store is a convenience, and the next successful sign-in rewrites it. That
// also absorbs the pre-per-user shape, which was a bare tenant name.
function readEntries(): Entry[] {
  const raw = readCookie() ?? safeLocal()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is Entry =>
        Array.isArray(e) && e.length === 2 && typeof e[0] === 'string' && typeof e[1] === 'string',
    )
  } catch {
    return []
  }
}

function safeLocal(): string | null {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null // private mode / storage disabled
  }
}

function writeEntries(entries: Entry[]): void {
  const value = JSON.stringify(entries.slice(0, MAX_USERS))
  writeCookie(value)
  try {
    // Always, even when the cookie stuck: it costs nothing and keeps the login
    // origin working if the cookie is later blocked or cleared independently.
    window.localStorage.setItem(KEY, value)
  } catch {
    /* storage unavailable — the cookie alone will have to do */
  }
}

/**
 * Remember where this user works. Written whenever a session resolves to a
 * tenant — sign-in, reload, refresh, an in-app switch — so the memory reflects
 * where they actually work rather than only where they last logged in.
 *
 * Deliberately survives sign-out: forgetting it would be forgetting the whole
 * point. What must not survive a sign-out is the ACTIVE tenant pin (`X-Tenant`,
 * in tokenStorage), which is a property of the session rather than of the
 * person — see the auth store's forgetActiveTenant.
 */
export function rememberTenantFor(user: string | null | undefined, tenant: string): void {
  if (!user || !tenant) return
  const key = userKey(user)
  writeEntries([[key, tenant], ...readEntries().filter(([k]) => k !== key)])
}

/** The workspace this user was last in, or null if we have not seen them. */
export function getLastTenantFor(user: string | null | undefined): string | null {
  if (!user) return null
  const key = userKey(user)
  return readEntries().find(([k]) => k === key)?.[1] ?? null
}

/** Forget one user's workspace. Everyone else's memory is left alone. */
export function forgetTenantFor(user: string | null | undefined): void {
  if (!user) return
  const key = userKey(user)
  writeEntries(readEntries().filter(([k]) => k !== key))
}

/**
 * Which workspace to send someone to, given what their token actually allows.
 *
 * The remembered name is only honoured if it is still one of theirs — access
 * changes, and a hint must never override the token. Otherwise the FIRST tenant
 * is used, which is both the stable choice (the list is ordered) and the right
 * landing place for a first sign-in with nothing remembered yet.
 */
export function chooseTenant(available: string[], remembered: string | null): string | null {
  if (!available.length) return null
  if (remembered && available.includes(remembered)) return remembered
  return available[0]
}
