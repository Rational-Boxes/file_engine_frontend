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
 * "Does this tenant actually have a working subdomain?"
 *
 * The sign-in origin hands a session to `https://<tenant>.<base>`. That host is
 * assumed to exist, and mostly it does — but a deployment can easily have
 * tenants whose subdomain was never set up: no wildcard DNS, a certificate that
 * covers only some names, or a dev tunnel that is simply not running. Forwarding
 * there produces a browser-level error page, on a host our code cannot reach to
 * apologise from. The user is stranded outside the app with no way back.
 *
 * So probe first, and if the origin does not answer, stay on the sign-in origin
 * and run the app there with the tenant carried in the `X-Tenant` header. The
 * bridge honours a non-reserved header regardless of host, so that path is
 * fully functional — it is a fallback, not a degraded mode.
 *
 * THE QUESTION IS "IS OUR APP THERE", NOT "DID SOMETHING ANSWER". Those are
 * very different, and the weaker one is useless in practice: wildcard DNS is
 * common — ngrok answers for every *.ngrok.io, parked domains answer for
 * everything — so an unconfigured subdomain typically returns a cheerful 404
 * error page rather than failing to resolve. A probe that accepted "something
 * answered" would forward users onto that error page, which is the exact
 * outcome this exists to prevent. Measured, not assumed: an unreserved
 * *.ngrok.io host returns HTTP 404 text/html, not a network failure.
 *
 * So the probe reads `/api/v1/auth/providers` and requires the bridge's own
 * marker in the reply. That endpoint sends `Access-Control-Allow-Origin: *`
 * precisely so this question can be asked — it is pre-auth, takes no
 * credentials, and carries nothing not already public to anyone who can load
 * the sign-in page. It is the bridge's only wildcard-CORS route, and the
 * general policy stays allow-list-only.
 *
 * That makes the test definite in BOTH directions: a real deployment is
 * readable and identifies itself; a dead host, a parked domain and somebody
 * else's error page all fail, whether they answer or not.
 *
 * WHEN IT IS WRONG, it is wrong in the safe direction. A tenant origin running
 * a bridge too old to send the marker reads as unreachable, so the user stays
 * on the sign-in origin — fully functional, just not forwarded, and it corrects
 * itself when that origin is upgraded. The opposite error, forwarding onto a
 * host that cannot serve the app, leaves them stranded outside it entirely.
 */

const CACHE_PREFIX = 'fe_reach:'

// Positive results are cached longer than negative ones on purpose. A stale
// "reachable" costs a failed forward at worst; a stale "unreachable" keeps
// someone on the sign-in origin after their subdomain has been fixed, which is
// the more annoying way to be wrong.
const TTL_OK_MS = 10 * 60 * 1000
const TTL_FAIL_MS = 60 * 1000

// Short by design: this sits between "signed in" and "seeing the app", so it is
// dead time. Better to forward optimistically than to make sign-in feel slow.
const TIMEOUT_MS = 2500

type Cached = { ok: boolean; at: number }

function readCache(origin: string): boolean | null {
  try {
    const raw = window.sessionStorage.getItem(CACHE_PREFIX + origin)
    if (!raw) return null
    const c = JSON.parse(raw) as Cached
    const ttl = c.ok ? TTL_OK_MS : TTL_FAIL_MS
    if (Date.now() - c.at > ttl) return null
    return c.ok
  } catch {
    return null // storage disabled, or a malformed entry — just re-probe
  }
}

function writeCache(origin: string, ok: boolean): void {
  try {
    window.sessionStorage.setItem(CACHE_PREFIX + origin, JSON.stringify({ ok, at: Date.now() }))
  } catch {
    /* storage unavailable — probing every time is correct, just slower */
  }
}

/** Forget a cached verdict (e.g. after a forward turned out to fail). */
export function forgetReachability(origin: string): void {
  try {
    window.sessionStorage.removeItem(CACHE_PREFIX + origin)
  } catch {
    /* nothing to do */
  }
}

/** The marker the bridge puts in its pre-auth config reply. */
const SERVICE_MARKER = 'fileengine-bridge'

/**
 * True if `origin` is a FileEngine origin we can hand a session to.
 *
 * Never throws and never blocks longer than the timeout. When the probe cannot
 * run at all (no `fetch`, e.g. under a non-browser runtime) it answers `true`
 * rather than denying every tenant its own origin on the strength of a missing
 * API.
 */
export async function tenantOriginReachable(origin: string): Promise<boolean> {
  if (!origin) return false
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return true

  const cached = readCache(origin)
  if (cached !== null) return cached

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  // The pre-auth "what does this deployment look like" call, which the SPA
  // already makes at bootstrap. A working origin certainly serves it, and no
  // credentials are involved in finding out.
  const url = `${origin}/api/v1/auth/providers`

  try {
    // `omit`: this is a question ABOUT an origin we have not yet established is
    // real. Sending credentials to it would be a gratuitous disclosure — and
    // the wildcard CORS header on that route would not permit them anyway.
    const res = await fetch(url, {
      method: 'GET', mode: 'cors', credentials: 'omit',
      cache: 'no-store', signal: controller.signal,
    })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const body = await res.json()
    // Identity, not mere readability. Something else's JSON is still something
    // else's — this must be our bridge, or the forward has nowhere useful to go.
    const ok = body?.service === SERVICE_MARKER
    writeCache(origin, ok)
    return ok
  } catch {
    // Everything lands here: DNS failure, refused connection, TLS error, a CORS
    // refusal, an HTML error page that will not parse as JSON, and the timeout.
    // None of them is an origin to send someone to mid-sign-in, and the cost of
    // being wrong is only that they stay here — where the app works.
    writeCache(origin, false)
    return false
  } finally {
    clearTimeout(timer)
  }
}
