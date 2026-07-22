import { describe, it, expect, beforeEach, vi } from 'vitest'

const { post } = vi.hoisted(() => ({ post: vi.fn() }))

vi.mock('@/services/ldapAdminClient', () => ({ default: { post } }))

import {
  oauthService,
  authorizeParamsFromQuery,
  scopeLabel,
} from '@/services/oauthService'

describe('authorizeParamsFromQuery', () => {
  it('reads the OAuth params with sensible defaults', () => {
    const p = authorizeParamsFromQuery(
      new URLSearchParams(
        'client_id=feoc_1&redirect_uri=https%3A%2F%2Fc%2Fcb&scope=openid%20email&state=s1' +
          '&nonce=n1&code_challenge=ch&code_challenge_method=S256',
      ),
    )
    expect(p.client_id).toBe('feoc_1')
    expect(p.redirect_uri).toBe('https://c/cb')
    expect(p.scope).toBe('openid email')
    expect(p.state).toBe('s1')
    expect(p.code_challenge).toBe('ch')
    // defaults
    expect(authorizeParamsFromQuery(new URLSearchParams('')).response_type).toBe('code')
    expect(authorizeParamsFromQuery(new URLSearchParams('')).code_challenge_method).toBe('S256')
  })
})

describe('scopeLabel', () => {
  it('maps known scopes and passes through unknown ones', () => {
    expect(scopeLabel('email')).toBe('Your email address')
    expect(scopeLabel('openid')).toContain('identity')
    expect(scopeLabel('custom:thing')).toBe('custom:thing')
  })
})

describe('oauthService', () => {
  const params = {
    response_type: 'code',
    client_id: 'feoc_1',
    redirect_uri: 'https://c/cb',
    scope: 'openid email',
    state: 's1',
    nonce: 'n1',
    code_challenge: 'ch',
    code_challenge_method: 'S256',
  }
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prepare posts the params and returns the action', async () => {
    post.mockResolvedValue({ data: { action: 'consent', client_name: 'App', scopes: ['openid'] } })
    const r = await oauthService.prepare(params)
    expect(post).toHaveBeenCalledWith('/oauth/authorize/prepare', params)
    expect(r).toEqual({ action: 'consent', client_name: 'App', scopes: ['openid'] })
  })

  it('decide posts the approval + remember flags', async () => {
    post.mockResolvedValue({ data: { action: 'redirect', url: 'https://c/cb?code=x' } })
    const r = await oauthService.decide(params, true, true)
    expect(post).toHaveBeenCalledWith('/oauth/authorize/decision', {
      ...params,
      approved: true,
      remember: true,
    })
    expect(r.url).toBe('https://c/cb?code=x')
  })
})
