import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkTokenRequest, requestThemeTokens, tokenRequestsEnabled } from './token-request'

afterEach(() => vi.unstubAllEnvs())
const base = { profileId: 'p1', spaceId: 's1', spaceName: 'Sun Club', theme: 'DAWN' }
const deps = () => ({ createTicket: vi.fn(async () => ({ id: 't', ref: 1042 })) })

describe('checkTokenRequest', () => {
  it('accepts a named token with a plain-words want', () => {
    expect(checkTokenRequest({ token: '--th-accent-soft', want: 'A softer accent for badges' }).ok).toBe(true)
  })
  it('refuses authored CSS in any field', () => {
    for (const bad of ['color: red; }', 'url(http://x)', '<style>', '@import x', '/* hi */', 'a !important']) {
      expect(checkTokenRequest({ token: 'x', want: bad }).ok).toBe(false)
      expect(checkTokenRequest({ token: bad, want: 'x' }).ok).toBe(false)
      expect(checkTokenRequest({ token: 'x', want: 'y', why: bad }).ok).toBe(false)
    }
  })
  it('needs a token and a want, and caps length', () => {
    expect(checkTokenRequest({ token: '', want: 'x' }).ok).toBe(false)
    expect(checkTokenRequest({ token: 'x', want: '' }).ok).toBe(false)
    expect(checkTokenRequest({ token: 'x'.repeat(81), want: 'y' }).ok).toBe(false)
    expect(checkTokenRequest({ token: 'x', want: 'y'.repeat(601) }).ok).toBe(false)
  })
})

describe('requestThemeTokens', () => {
  it('is dark by default and files nothing', async () => {
    const d = deps()
    expect(tokenRequestsEnabled()).toBe(false)
    const r = await requestThemeTokens({ ...base, requests: [{ token: 'a', want: 'b' }] }, d)
    expect(r.ok).toBe(false)
    expect(d.createTicket).not.toHaveBeenCalled()
  })
  it('files one idea ticket when on', async () => {
    vi.stubEnv('SITE_TOKEN_REQUESTS_ENABLED', '1')
    const d = deps()
    const r = await requestThemeTokens({ ...base, requests: [{ token: '--th-accent-soft', want: 'softer', why: 'badges' }] }, d)
    expect(r).toEqual({ ok: true, ref: 1042 })
    expect(d.createTicket).toHaveBeenCalledOnce()
    const arg = (d.createTicket.mock.calls[0] as unknown as [{ type: string; body: string }])[0]
    expect(arg.type).toBe('idea')
    expect(arg.body).toContain('--th-accent-soft')
  })
  it('refuses a bad request and a batch over five without filing', async () => {
    vi.stubEnv('SITE_TOKEN_REQUESTS_ENABLED', 'on')
    const d = deps()
    expect((await requestThemeTokens({ ...base, requests: [{ token: 'a', want: 'x { y }' }] }, d)).ok).toBe(false)
    expect((await requestThemeTokens({ ...base, requests: Array(6).fill({ token: 'a', want: 'b' }) }, d)).ok).toBe(false)
    expect((await requestThemeTokens({ ...base, requests: [] }, d)).ok).toBe(false)
    expect(d.createTicket).not.toHaveBeenCalled()
  })
  it('turns a ticket failure into a calm message', async () => {
    vi.stubEnv('SITE_TOKEN_REQUESTS_ENABLED', 'true')
    const r = await requestThemeTokens({ ...base, requests: [{ token: 'a', want: 'b' }] }, { createTicket: async () => { throw new Error('db') } })
    expect(r.ok).toBe(false)
  })
})
