import { describe, expect, it, vi } from 'vitest'
import { lookupLiveSiteDomain } from './live-domain-lookup'

const answer = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body })) as unknown as typeof fetch

describe('lookupLiveSiteDomain (LIVE-SUBDOMAIN-ATTRIBUTION)', () => {
  it('asks the cached site-domain route on the app origin and returns the domain', async () => {
    const f = answer({ domain: 'danieltyack.com' })
    expect(await lookupLiveSiteDomain('DanielTyack', f)).toBe('danieltyack.com')
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/^https:\/\/[^/]+\/api\/site-domain\/danieltyack$/)
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect((init.headers as Record<string, string>).accept).toBe('application/json')
  })

  it('answers null for no domain, a bad answer, a failed response and a thrown fetch', async () => {
    expect(await lookupLiveSiteDomain('x', answer({ domain: null }))).toBeNull()
    expect(await lookupLiveSiteDomain('x', answer({ domain: 7 }))).toBeNull()
    expect(await lookupLiveSiteDomain('x', answer({ domain: 'a.com' }, false))).toBeNull()
    expect(await lookupLiveSiteDomain('x', vi.fn(async () => { throw new Error('timeout') }) as unknown as typeof fetch)).toBeNull()
  })
})
