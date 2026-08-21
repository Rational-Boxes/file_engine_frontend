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
 * "Which workspace was I last in?" — the hint that lets the shared sign-in
 * origin send a returning user straight through instead of asking again.
 *
 * **This is a hint, never a credential.** Nothing may be authorised on the
 * strength of it. It names a tenant the user may no longer belong to, may be
 * edited freely in devtools, and is read by an origin that has not yet
 * authenticated anyone. Every consumer re-checks the name against the tenants
 * the user's token actually carries and falls back when it does not match.
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

function readCookie(): string | null {
  if (typeof document === 'undefined') return null
  for (const part of document.cookie.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === KEY) return decodeURIComponent(v.join('=')) || null
  }
  return null
}

function writeCookie(tenant: string): boolean {
  if (typeof document === 'undefined') return false
  const domain = parentCookieDomain()
  if (!domain) return false
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:'
  document.cookie =
    `${KEY}=${encodeURIComponent(tenant)}; Domain=${domain}; Path=/; ` +
    `Max-Age=${MAX_AGE_DAYS * 24 * 60 * 60}; SameSite=Lax${secure ? '; Secure' : ''}`
  // Read it back rather than predicting. A public-suffix parent (".ngrok.io")
  // is refused silently by the browser, and no amount of string inspection here
  // could tell us that without shipping a Public Suffix List.
  return readCookie() === tenant
}

/** The last workspace this browser was in, or null. Cookie wins. */
export function getLastTenant(): string | null {
  const fromCookie = readCookie()
  if (fromCookie) return fromCookie
  try {
    return window.localStorage.getItem(KEY) || null
  } catch {
    return null // private mode / storage disabled
  }
}

/**
 * Remember the workspace. Written on entering a tenant and on switching, so the
 * memory reflects where the user actually works rather than only where they
 * last logged in.
 */
export function setLastTenant(tenant: string): void {
  if (!tenant) return
  writeCookie(tenant)
  try {
    // Always, even when the cookie stuck: it costs nothing and keeps the login
    // origin working if the cookie is later blocked or cleared independently.
    window.localStorage.setItem(KEY, tenant)
  } catch {
    /* storage unavailable — the cookie alone will have to do */
  }
}

/** Forget it — on explicit sign-out, so a shared machine does not leak it. */
export function clearLastTenant(): void {
  const domain = parentCookieDomain()
  if (typeof document !== 'undefined' && domain) {
    document.cookie = `${KEY}=; Domain=${domain}; Path=/; Max-Age=0; SameSite=Lax`
  }
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* nothing to do */
  }
}

/**
 * Which workspace to send someone to, given what their token actually allows.
 *
 * The remembered name is only honoured if it is still one of theirs — access
 * changes, and a hint must never override the token. Otherwise the FIRST tenant
 * is used, which is both the stable choice (the list is ordered) and the right
 * landing place for a first sign-in with nothing remembered yet.
 */
export function chooseTenant(available: string[], remembered = getLastTenant()): string | null {
  if (!available.length) return null
  if (remembered && available.includes(remembered)) return remembered
  return available[0]
}
