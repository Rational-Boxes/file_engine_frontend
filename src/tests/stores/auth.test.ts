import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/authService', () => ({
  authService: {
    ldapLogin: vi.fn(),
    verify2fa: vi.fn(),
    send2faCode: vi.fn(),
    whoami: vi.fn(),
    consumeOAuthFragment: vi.fn(),
    logout: vi.fn(),
    oauthRedirect: vi.fn(),
    refresh: vi.fn(),
    listTenants: vi.fn(async () => ({ tenants: [], current: '' })),
  },
}))

vi.mock('@/utils/tokenStorage', () => ({
  tokenStorage: {
    isAuthenticated: vi.fn(() => false),
    getAccessToken: vi.fn(() => 'tok'),
    getTokens: vi.fn(() => null), // null => scheduleRefresh sets no timer in tests
    getActiveTenant: vi.fn(() => null),
    setActiveTenant: vi.fn(),
    getTenants: vi.fn(() => []),
    setTenants: vi.fn(),
    clearTokens: vi.fn(),
  },
}))

const { activeTenantFromHost } = vi.hoisted(() => ({ activeTenantFromHost: vi.fn(() => null as string | null) }))
vi.mock('@/utils/tenantHost', () => ({ activeTenantFromHost }))

import { useAuthStore } from '@/stores/auth'
import { authService } from '@/services/authService'

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('ldapLogin stores identity from whoami on success', async () => {
    ;(authService.ldapLogin as any).mockResolvedValue({ kind: 'session' })
    ;(authService.whoami as any).mockResolvedValue({
      user: 'alice',
      tenant: 'default',
      roles: ['editor'],
    })
    const store = useAuthStore()
    const ok = await store.ldapLogin('alice', 'pw')
    expect(ok).toBe(true)
    expect(store.isAuthenticated).toBe(true) // reactive — updates without reload
    expect(store.user).toBe('alice')
    expect(store.accessLevel).toBe('editor')
    expect(store.hasAccessLevel('user')).toBe(true)
    expect(store.hasAccessLevel('admin')).toBe(false)
  })

  it('ldapLogin carries the current subdomain tenant (X-Tenant) into the login', async () => {
    ;(activeTenantFromHost as any).mockReturnValue('acme')
    ;(authService.ldapLogin as any).mockResolvedValue({ kind: 'session' })
    ;(authService.whoami as any).mockResolvedValue({ user: 'a', tenant: 'acme', roles: [] })
    const { tokenStorage } = await import('@/utils/tokenStorage')
    const store = useAuthStore()
    await store.ldapLogin('alice', 'pw')
    expect(authService.ldapLogin).toHaveBeenCalledWith('alice', 'pw', 'acme')
    expect(tokenStorage.setActiveTenant).toHaveBeenCalledWith('acme')
    expect(store.tenant).toBe('acme')
  })

  it('ldapLogin reports an error on failure', async () => {
    ;(authService.ldapLogin as any).mockRejectedValue(new Error('nope'))
    const store = useAuthStore()
    const ok = await store.ldapLogin('alice', 'bad')
    expect(ok).toBe(false)
    expect(store.error).toBeTruthy()
    expect(store.user).toBeNull()
  })

  it('ldapLogin sets an mfa challenge (not a session) when a second factor is required', async () => {
    ;(authService.ldapLogin as any).mockResolvedValue({
      kind: 'mfa',
      mfaToken: 'mtok',
      methods: ['totp', 'email'],
      mustEnroll: false,
    })
    const store = useAuthStore()
    const ok = await store.ldapLogin('alice', 'pw')
    expect(ok).toBe(false) // not signed in yet
    expect(store.error).toBeNull() // a challenge is not an error
    expect(store.mfaChallenge).toEqual({
      mfaToken: 'mtok',
      methods: ['totp', 'email'],
      mustEnroll: false,
    })
    expect(authService.whoami).not.toHaveBeenCalled()
  })

  it('verify2fa completes the challenge and establishes a session', async () => {
    ;(authService.ldapLogin as any).mockResolvedValue({
      kind: 'mfa', mfaToken: 'mtok', methods: ['totp'], mustEnroll: false,
    })
    ;(authService.verify2fa as any).mockResolvedValue(undefined)
    ;(authService.whoami as any).mockResolvedValue({ user: 'alice', tenant: 'default', roles: ['editor'] })
    const store = useAuthStore()
    await store.ldapLogin('alice', 'pw')
    const ok = await store.verify2fa('totp', '123456')
    expect(ok).toBe(true)
    expect(authService.verify2fa).toHaveBeenCalledWith('mtok', 'totp', '123456')
    // mfaChallenge is intentionally NOT cleared here — clearing it would unmount
    // <TwoFactorChallenge> before its emit('done') can trigger navigation. It is
    // cleared by the view (goAfterLogin) after it navigates away.
    expect(store.user).toBe('alice')
    expect(store.isAuthenticated).toBe(true)
  })

  it('verify2fa keeps the challenge and reports an error on a wrong code', async () => {
    ;(authService.ldapLogin as any).mockResolvedValue({
      kind: 'mfa', mfaToken: 'mtok', methods: ['totp'], mustEnroll: false,
    })
    ;(authService.verify2fa as any).mockRejectedValue(new Error('invalid'))
    const store = useAuthStore()
    await store.ldapLogin('alice', 'pw')
    const ok = await store.verify2fa('totp', '000000')
    expect(ok).toBe(false)
    expect(store.error).toBeTruthy()
    expect(store.mfaChallenge).not.toBeNull() // still challenging — user can retry
  })

  it('cancelMfa clears the pending challenge', async () => {
    ;(authService.ldapLogin as any).mockResolvedValue({
      kind: 'mfa', mfaToken: 'mtok', methods: ['totp'], mustEnroll: false,
    })
    const store = useAuthStore()
    await store.ldapLogin('alice', 'pw')
    store.cancelMfa()
    expect(store.mfaChallenge).toBeNull()
  })

  it('maps administrators/system_admin to admin level', async () => {
    ;(authService.consumeOAuthFragment as any).mockReturnValue(true)
    ;(authService.whoami as any).mockResolvedValue({
      user: 'root',
      tenant: 'default',
      roles: ['system_admin'],
    })
    const store = useAuthStore()
    const ok = await store.completeOAuth()
    expect(ok).toBe(true)
    expect(store.accessLevel).toBe('admin')
  })

  it('completeOAuth fails when no token is present', async () => {
    ;(authService.consumeOAuthFragment as any).mockReturnValue(false)
    const store = useAuthStore()
    expect(await store.completeOAuth()).toBe(false)
  })

  it('logout clears identity', async () => {
    ;(authService.logout as any).mockResolvedValue(undefined)
    const store = useAuthStore()
    store.user = 'alice'
    await store.logout()
    expect(authService.logout).toHaveBeenCalled()
    expect(store.user).toBeNull()
  })

  it('doRefresh re-mints the token and re-applies identity', async () => {
    ;(authService.refresh as any).mockResolvedValue(undefined)
    ;(authService.whoami as any).mockResolvedValue({
      user: 'alice',
      tenant: 't1',
      roles: ['users'],
    })
    const store = useAuthStore()
    await store.doRefresh()
    expect(authService.refresh).toHaveBeenCalled()
    expect(store.user).toBe('alice')
    expect(store.roles).toEqual(['users'])
  })

  it('doRefresh logs out when the refresh is rejected (revoked session)', async () => {
    ;(authService.refresh as any).mockRejectedValue(new Error('401'))
    ;(authService.logout as any).mockResolvedValue(undefined)
    const store = useAuthStore()
    store.user = 'alice'
    await store.doRefresh()
    expect(authService.logout).toHaveBeenCalled()
    expect(store.user).toBeNull()
  })
})
