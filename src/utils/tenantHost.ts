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

// Subdomain → tenant resolution.
//
// The SPA is served per tenant at `<tenant>.<domain>` — e.g. `someco.host.com`
// in the unified deployment, or `someco.ngrok.io` when tunnelling for dev. The
// leading DNS label is authoritative for which tenant site the user is on, so
// on load we adopt it as the active tenant (sent as the X-Tenant header)
// instead of relying solely on the in-app selector. A user with access to
// multiple tenants switches simply by visiting another tenant's subdomain.
//
// Only the leading label matters — the rest of the domain is irrelevant, which
// mirrors the bridge's own extractTenantFromHostname. A host with no subdomain
// (bare `localhost`, a single-label host, or an IP literal) has no tenant, so
// every helper degrades to "no subdomain tenant" and the app falls back to the
// persisted/selected tenant.

// The shared sign-in origin's DNS label.
//
// CONFIGURABLE, and learned at RUN TIME from the bridge rather than baked in at
// build time — the packaged SPA is built once and run by many deployments, and
// a deployment may well be unable to reserve "login" on its domain (on a shared
// host like ngrok.io it is very likely already taken). "login" is only the
// default until the bridge says otherwise.
//
// Kept in step with the bridge's own isReservedTenantLabel: if the two disagree
// the SPA would bounce users to a host that resolves as an ordinary tenant.
let loginLabel = 'login'

/** Called once during bootstrap, before the router runs. */
export function setLoginLabel(label: string): void {
  if (label) loginLabel = label.toLowerCase()
}

export function getLoginLabel(): string {
  return loginLabel
}

// Labels that are never a tenant even when they appear as the leading label.
const STATIC_RESERVED = new Set(['www', 'app', 'api', 'csai'])
function isReservedLabel(label: string): boolean {
  return STATIC_RESERVED.has(label) || label === loginLabel
}

// Derive the tenant from a hostname: the first hyphen-delimited segment of the
// leading DNS label, regardless of the rest of the domain. Returns null when the
// host carries no usable subdomain. This mirrors the bridge's own
// extractTenantFromHostname exactly: tenant names contain no hyphen, and an
// `<tenant>-<interface>` label (e.g. `acme-drive` for WebDAV) resolves to the
// tenant, so `default.host`, `default-drive.host`, and `default-fileengine.host`
// all resolve to `default`.
export function tenantFromHostname(hostname: string): string | null {
  if (!hostname) return null
  const host = hostname.toLowerCase().replace(/\.$/, '')
  const firstDot = host.indexOf('.')
  if (firstDot <= 0) return null // bare host (e.g. "localhost") — no tenant
  const fullLabel = host.slice(0, firstDot)
  const dash = fullLabel.indexOf('-')
  const label = dash > 0 ? fullLabel.slice(0, dash) : fullLabel // <tenant>-<interface> -> tenant
  if (/^\d+$/.test(label)) return null // IPv4 literal — not a tenant subdomain
  if (isReservedLabel(label)) return null
  return label
}

// The tenant implied by the current window's hostname (null off a tenant host).
export function activeTenantFromHost(): string | null {
  if (typeof window === 'undefined') return null
  return tenantFromHostname(window.location.hostname)
}

// True when the current host is a tenant subdomain — i.e. the tenant is keyed by
// subdomain and switching tenant means navigating to another origin (vs. an
// in-app swap).
export function subdomainTenancyEnabled(): boolean {
  return activeTenantFromHost() !== null
}

// Public URL of another tenant's SPA: swap the leading label of the current host
// for `tenant`, preserving the rest of the domain, port, and path/hash so a
// tenant switch lands the user in the same place. Returns null when the current
// host is not a tenant subdomain (caller should fall back to an in-app switch).
export function tenantUrl(tenant: string): string | null {
  if (typeof window === 'undefined') return null
  const { protocol, hostname, port, pathname, search, hash } = window.location
  if (tenantFromHostname(hostname) === null) return null
  const rest = hostname.slice(hostname.indexOf('.')) // ".ngrok.io"
  const host = `${tenant}${rest}${port ? ':' + port : ''}`
  return `${protocol}//${host}${pathname}${search}${hash}`
}

// --- the shared sign-in origin -------------------------------------------
//
// Every tenant subdomain sends a signed-out visitor to `login.<domain>`, which
// authenticates once and hands the session back to the tenant. The point is
// that OAuth then returns to exactly ONE origin, so OAUTH_RETURN_ALLOWLIST
// holds a single entry however many tenants exist — instead of growing with
// each new one, and needing a bridge restart each time.

/** True when this window IS the shared sign-in origin. */
export function isLoginOrigin(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname.toLowerCase().replace(/\.$/, '')
  const firstDot = host.indexOf('.')
  if (firstDot <= 0) return false
  return host.slice(0, firstDot) === loginLabel
}

/**
 * URL of the sign-in origin, carrying where to come back to.
 *
 * `next` is a PATH on the tenant's own origin, never a full URL — a full URL
 * here would be an open-redirect parameter, and the tenant is named separately
 * so the return target is reconstructed rather than trusted.
 */
export function loginUrl(next?: string, tenant?: string | null): string | null {
  if (typeof window === 'undefined') return null
  const { protocol, hostname, port } = window.location
  const firstDot = hostname.indexOf('.')
  if (firstDot <= 0) return null // bare host — no subdomain to swap
  const rest = hostname.slice(firstDot) // ".example.com"
  const host = `${loginLabel}${rest}${port ? ':' + port : ''}`
  const q = new URLSearchParams()
  if (next) q.set('next', next)
  if (tenant) q.set('t', tenant)
  const qs = q.toString()
  return `${protocol}//${host}/login${qs ? '?' + qs : ''}`
}

/**
 * The registrable-ish parent domain, for scoping the last-tenant cookie.
 *
 * Returns e.g. ".example.com" for "acme.example.com". Deliberately naive: the
 * browser rejects a cookie set on a public suffix (".ngrok.io", ".co.uk"), and
 * we cannot ship a Public Suffix List. The caller therefore ATTEMPTS the cookie
 * and verifies it stuck, rather than predicting whether it will.
 */
export function parentCookieDomain(): string | null {
  if (typeof window === 'undefined') return null
  const host = window.location.hostname.toLowerCase().replace(/\.$/, '')
  if (/^[\d.]+$/.test(host)) return null // IP literal
  const firstDot = host.indexOf('.')
  if (firstDot <= 0) return null
  return host.slice(firstDot) // ".example.com"
}

/**
 * Just the ORIGIN of a tenant's SPA — no path, unlike tenantUrl which carries
 * the current one across. Used when handing a session over: the destination
 * path comes from the hand-off, not from wherever the login page happened to be.
 */
export function tenantOrigin(tenant: string): string {
  if (typeof window === 'undefined') return ''
  const { protocol, hostname, port } = window.location
  const firstDot = hostname.indexOf('.')
  const rest = firstDot > 0 ? hostname.slice(firstDot) : ''
  return `${protocol}//${tenant}${rest}${port ? ':' + port : ''}`
}
