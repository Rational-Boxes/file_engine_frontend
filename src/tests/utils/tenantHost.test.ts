import { describe, it, expect } from 'vitest'
import { tenantFromHostname } from '@/utils/tenantHost'

describe('tenantFromHostname', () => {
  it('takes the leading label as the tenant', () => {
    expect(tenantFromHostname('acme.example.com')).toBe('acme')
    expect(tenantFromHostname('filenginetest.ngrok.io')).toBe('filenginetest')
    expect(tenantFromHostname('default.ngrok.io')).toBe('default')
  })

  it('truncates at the first hyphen — <tenant>-<interface> resolves to the tenant', () => {
    // Tenant ids contain no hyphen, so an interface-suffixed host (WebDAV -drive, etc.)
    // and any hyphenated SPA host resolve to the same tenant (matches the bridge rule).
    expect(tenantFromHostname('default-drive.ngrok.io')).toBe('default')
    expect(tenantFromHostname('default-fileengine.ngrok.io')).toBe('default')
    expect(tenantFromHostname('acme-drive.example.com')).toBe('acme')
  })

  it('returns null for bare hosts, IPs, and reserved labels', () => {
    expect(tenantFromHostname('localhost')).toBeNull()
    expect(tenantFromHostname('example.com')).toBe('example') // two-label -> leading label
    expect(tenantFromHostname('127.0.0.1')).toBeNull()
    expect(tenantFromHostname('www.example.com')).toBeNull()
    expect(tenantFromHostname('')).toBeNull()
  })
})
