import { describe, it, expect } from 'vitest'
import { chatSocketUrl, CSAI_BASE, errorMessage } from '@/services/csaiClient'

describe('csaiClient: chat WebSocket URL', () => {
  it('maps http→ws and carries token + tenant as query params', () => {
    expect(chatSocketUrl('http://localhost:8092', 'tok', 'acme')).toBe(
      'ws://localhost:8092/chat?token=tok&tenant=acme',
    )
  })

  it('maps https→wss and omits an absent tenant', () => {
    expect(chatSocketUrl('https://csai.example.com/', 'tok', null)).toBe(
      'wss://csai.example.com/chat?token=tok',
    )
  })

  it('produces a bare /chat URL with no credentials', () => {
    expect(chatSocketUrl('http://h:1', null, null)).toBe('ws://h:1/chat')
  })

  it('strips trailing slashes on the base', () => {
    expect(chatSocketUrl('http://h:1///', 'a', null)).toBe('ws://h:1/chat?token=a')
  })
})

describe('csaiClient: module surface', () => {
  it('exposes a base URL (env override or :8092 default)', () => {
    expect(typeof CSAI_BASE).toBe('string')
    expect(CSAI_BASE.length).toBeGreaterThan(0)
  })

  it('re-exports errorMessage for callers', () => {
    expect(errorMessage(new Error('boom'), 'fallback')).toBe('boom')
  })
})
