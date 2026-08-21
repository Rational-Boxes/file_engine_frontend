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
 * FORWARDING IS PREFERRED, and that shapes the whole design: a tenant on its own
 * origin gets its own cookie jar and storage, and the URL says which workspace
 * you are in. So this answers "unreachable" ONLY on a definite failure. Anything
 * ambiguous forwards.
 *
 * WHAT THIS CAN AND CANNOT TELL APART — worth being precise, because it is
 * easy to assume it proves more than it does:
 *
 *   Definite yes   the origin served a readable, well-formed bridge response.
 *                  Only possible when it allows this origin by CORS.
 *   Definite no    the request failed at the network layer — DNS did not
 *                  resolve, the connection was refused, TLS failed. This is the
 *                  case that matters: an unconfigured subdomain.
 *   Ambiguous      something answered but we cannot read it (no CORS headers).
 *                  Treated as reachable, because forwarding is preferred and a
 *                  deployment is not required to configure cross-origin reads
 *                  just to satisfy this check.
 *
 * The ambiguous bucket is a real limit. A host that answers with somebody
 * else's error page — a parked domain, or an ngrok wildcard returning "tunnel
 * not found" — reads as reachable and we will forward to it. Distinguishing
 * that would need to READ the response, which needs CORS, which would make
 * every tenant read as unreachable wherever CORS is not configured. That
 * trade-off is the wrong way round given forwarding is the preferred outcome.
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

/**
 * True if `origin` looks like a working FileEngine origin we can forward to.
 *
 * Never throws and never blocks longer than the timeout: a probe that cannot
 * decide returns `true`, because the cost of being wrong that way is one failed
 * forward, while being wrong the other way silently denies a tenant its own
 * origin for the whole session.
 */
export async function tenantOriginReachable(origin: string): Promise<boolean> {
  if (!origin) return false
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return true

  const cached = readCache(origin)
  if (cached !== null) return cached

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  // The bridge's only pre-auth endpoint, and the one the SPA already calls at
  // bootstrap — so a working origin certainly serves it, and no credentials are
  // involved in finding out.
  const url = `${origin}/api/v1/auth/providers`

  try {
    // `omit`: this is a liveness question about another origin, and sending
    // credentials to a host we have not yet established is real would be a
    // gratuitous disclosure.
    const res = await fetch(url, {
      method: 'GET', mode: 'cors', credentials: 'omit',
      cache: 'no-store', signal: controller.signal,
    })
    // Any HTTP answer at all means something is serving this name; whether it
    // is 200 or 500 is not what is being asked.
    writeCache(origin, res.ok || res.status > 0)
    return true
  } catch {
    // A CORS refusal and a dead host both land here, and they are not the same
    // thing — so ask again without needing to read the response. This resolves
    // opaquely whenever ANYTHING answered, and rejects only on a genuine
    // network-level failure, which is exactly the distinction that matters.
    try {
      await fetch(url, {
        method: 'GET', mode: 'no-cors', credentials: 'omit',
        cache: 'no-store', signal: controller.signal,
      })
      writeCache(origin, true)
      return true
    } catch {
      // Includes the abort: a host that has not answered within the timeout is
      // not somewhere to send a person mid-login, whatever the reason.
      writeCache(origin, false)
      return false
    }
  } finally {
    clearTimeout(timer)
  }
}
