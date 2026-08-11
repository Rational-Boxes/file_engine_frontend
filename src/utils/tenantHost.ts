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

// Labels that are never a tenant even when they appear as the leading label.
const RESERVED_LABELS = new Set(['www', 'app', 'api', 'csai'])

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
  if (RESERVED_LABELS.has(label)) return null
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
