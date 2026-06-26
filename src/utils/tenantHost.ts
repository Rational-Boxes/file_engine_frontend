// Subdomain → tenant resolution.
//
// In the unified deployment the SPA is served per tenant at
// `<tenant>.<base-domain>` (e.g. `someco.host.com`). The subdomain is
// authoritative for which tenant site the user is on, so on load we adopt it as
// the active tenant (sent as the X-Tenant header) instead of relying solely on
// the in-app selector. A user with access to multiple tenants switches simply by
// visiting another tenant's subdomain.
//
// `VITE_BASE_DOMAIN` is the apex the tenants live under (leading/trailing dots
// optional, e.g. `host.com` or `.host.com`). When it is unset — local dev on
// `localhost`, or a single-tenant deployment — every helper degrades to "no
// subdomain tenant" and the app falls back to the persisted/selected tenant.

const BASE_DOMAIN = (import.meta.env.VITE_BASE_DOMAIN || '')
  .trim()
  .replace(/^\.+/, '')
  .replace(/\.+$/, '')
  .toLowerCase()

// Labels that are never a tenant even when they sit under the base domain.
const RESERVED_LABELS = new Set(['www', 'app', 'api', 'csai'])

// Derive the tenant from a hostname, or null for the apex / a non-matching host.
// The SPA host carries a bare tenant label (`someco`); the WebDAV `-drive` host
// never reaches the SPA, and tenant names contain no hyphen, so the whole label
// is the tenant.
export function tenantFromHostname(hostname: string): string | null {
  if (!BASE_DOMAIN || !hostname) return null
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (host === BASE_DOMAIN) return null // apex — no tenant
  const suffix = '.' + BASE_DOMAIN
  if (!host.endsWith(suffix)) return null // different domain (localhost, IP, …)
  const label = host.slice(0, -suffix.length)
  if (!label || label.includes('.')) return null // only a single-label subdomain
  if (RESERVED_LABELS.has(label)) return null
  return label
}

// The tenant implied by the current window's hostname (null off a tenant host).
export function activeTenantFromHost(): string | null {
  if (typeof window === 'undefined') return null
  return tenantFromHostname(window.location.hostname)
}

// True when a base domain is configured — i.e. tenants are keyed by subdomain
// and switching tenant means navigating to another origin (vs. an in-app swap).
export function subdomainTenancyEnabled(): boolean {
  return !!BASE_DOMAIN
}

// Public URL of another tenant's SPA, preserving the current path/hash so a
// tenant switch lands the user in the same place. Returns null when subdomain
// tenancy is disabled (caller should fall back to an in-app switch).
export function tenantUrl(tenant: string): string | null {
  if (!BASE_DOMAIN || typeof window === 'undefined') return null
  const { protocol, port, pathname, search, hash } = window.location
  const host = `${tenant}.${BASE_DOMAIN}${port ? ':' + port : ''}`
  return `${protocol}//${host}${pathname}${search}${hash}`
}
