import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/authService', () => ({
  authService: {
    ldapLogin: vi.fn(),
    whoami: vi.fn(),
    consumeOAuthFragment: vi.fn(),
    logout: vi.fn(),
    oauthRedirect: vi.fn(),
  },
}))

vi.mock('@/utils/tokenStorage', () => ({
  tokenStorage: {
    isAuthenticated: vi.fn(() => false),
    clearTokens: vi.fn(),
  },
}))

import { useAuthStore } from '@/stores/auth'
import { authService } from '@/services/authService'

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('ldapLogin stores identity from whoami on success', async () => {
    ;(authService.ldapLogin as any).mockResolvedValue(undefined)
    ;(authService.whoami as any).mockResolvedValue({
      user: 'alice',
      tenant: 'default',
      roles: ['editor'],
    })
    const store = useAuthStore()
    const ok = await store.ldapLogin('alice', 'pw')
    expect(ok).toBe(true)
    expect(store.user).toBe('alice')
    expect(store.accessLevel).toBe('editor')
    expect(store.hasAccessLevel('user')).toBe(true)
    expect(store.hasAccessLevel('admin')).toBe(false)
  })

  it('ldapLogin reports an error on failure', async () => {
    ;(authService.ldapLogin as any).mockRejectedValue(new Error('nope'))
    const store = useAuthStore()
    const ok = await store.ldapLogin('alice', 'bad')
    expect(ok).toBe(false)
    expect(store.error).toBeTruthy()
    expect(store.user).toBeNull()
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
})
