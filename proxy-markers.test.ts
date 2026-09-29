import { describe, it, expect, vi, beforeAll } from 'vitest'

// ── LIVE-649 (ADR-1617): the proxy does not re-send a marker cookie on a Server Action ───────────
//
// Next merges any cookie the proxy sets into a Server Action's own cookie store, and reports such an
// action to the client as "cookies changed" (next/dist/server/async-storage/request-store.js,
// mergeMiddlewareCookies; server/app-render/action-handler.js, addRevalidationHeader). The client then
// drops its whole prefetch cache, re-renders the page and prefetches every visible Link. The proxy
// wrote `fq_acct` on EVERY signed-in response, so the 90 s presence heartbeat, a no-op action, cost
// one request per Link on screen, per tab, forever. Measured locally on a Next 16.3.6 build: four
// pings in 16 s, cookie written = 53 requests, cookie not written = 16.
//
// Like proxy-consent.test.ts this runs the REAL proxy against a real NextRequest and reads the
// Set-Cookie headers off the response. Only the network edge (the Supabase session read) is mocked.

const getUser = vi.fn(async () => ({ data: { user: { id: 'member-1' } } }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser } }),
}))

vi.mock('@/lib/platform-flags', () => ({
  referralsEnabled: async () => true,
}))

let NextRequest: typeof import('next/server').NextRequest
let proxy: typeof import('./proxy').proxy

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon-key-for-tests'
  ;({ NextRequest } = await import('next/server'))
  ;({ proxy } = await import('./proxy'))
})

type Kind = 'action' | 'prefetch' | 'navigation' | 'document'

async function cookiesWritten(kind: Kind, opts: { cookie?: string; country?: string; path?: string } = {}) {
  const headers = new Headers()
  if (opts.cookie) headers.set('cookie', opts.cookie)
  if (opts.country) headers.set('x-vercel-ip-country', opts.country)
  if (kind === 'action') headers.set('next-action', '7f3a')
  if (kind === 'prefetch') {
    headers.set('rsc', '1')
    headers.set('next-router-prefetch', '1')
  }
  if (kind === 'navigation') headers.set('rsc', '1')
  const request = new NextRequest(`https://frequencylocal.com${opts.path ?? '/feed'}`, {
    method: kind === 'action' ? 'POST' : 'GET',
    headers,
  })
  const response = await proxy(request)
  return new Set(response.cookies.getAll().map((c) => c.name))
}

describe('🔴 a Server Action from a signed-in member carries no marker cookie (LIVE-649)', () => {
  it('the presence heartbeat, marker already held: no fq_acct write', async () => {
    const written = await cookiesWritten('action', { cookie: 'fq_acct=1' })
    expect(written.has('fq_acct'), 'fq_acct set on a Server Action turns every action into a full cache invalidation').toBe(false)
  })

  it('a Link prefetch and a client navigation with the marker held: no write', async () => {
    expect((await cookiesWritten('prefetch', { cookie: 'fq_acct=1' })).has('fq_acct')).toBe(false)
    expect((await cookiesWritten('navigation', { cookie: 'fq_acct=1' })).has('fq_acct')).toBe(false)
  })

  it('in a prior-consent region, fq_ask already held: no write on an action', async () => {
    const written = await cookiesWritten('action', { cookie: 'fq_acct=1; fq_ask=1', country: 'DE' })
    expect(written.has('fq_ask')).toBe(false)
    expect(written.has('fq_acct')).toBe(false)
  })
})

describe('the markers still do their job', () => {
  it('a member without the marker gets it, on any request', async () => {
    expect((await cookiesWritten('action')).has('fq_acct')).toBe(true)
    expect((await cookiesWritten('prefetch')).has('fq_acct')).toBe(true)
  })

  it('a full page load refreshes the rolling max-age', async () => {
    expect((await cookiesWritten('document', { cookie: 'fq_acct=1' })).has('fq_acct')).toBe(true)
    expect((await cookiesWritten('document', { cookie: 'fq_acct=1; fq_ask=1', country: 'FR' })).has('fq_ask')).toBe(true)
  })

  it('a visitor who left the region still has fq_ask cleared', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } } as never)
    const response = await proxy(
      new NextRequest('https://frequencylocal.com/', { headers: { cookie: 'fq_ask=1', 'x-vercel-ip-country': 'US' } }),
    )
    const ask = response.cookies.get('fq_ask')
    expect(ask?.value ?? '').toBe('')
  })
})
