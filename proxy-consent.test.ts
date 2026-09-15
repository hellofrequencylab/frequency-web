import { describe, it, expect, vi, beforeAll } from 'vitest'

// ── 🔴 THE OTHER HALF OF THE ORDERING ARM (OWN-061, ADR-1367) ───────────────────────────────────
//
// The ruling: "a banner that gates GA4 but lets the attribution cookie set on first paint is not
// consent, it is a banner. The gate must sit in front of BOTH writers, and the check that proves it
// should assert no `document.cookie` write and no GA4 load before a choice is recorded — a
// source-shape guard will not catch this, because the defect is ordering at runtime."
//
// The GA4 half is proved in lib/consent/cookie-consent.test.ts, by executing the real head script
// in a DOM. This is the OTHER writer, and it is the one that could never have been fixed by a
// banner alone: `fq_attr` is written at the EDGE, on the visitor's very first request, before any
// page JS exists to ask a question. So this file runs the REAL proxy — the actual exported
// function, not a re-implementation of its rules — against a real NextRequest, and reads the
// Set-Cookie headers off the response it returns. Nothing here inspects source.
//
// Everything mocked below is a NETWORK edge (the Supabase session read, the platform flag), never a
// rule under test. The consent decision, the first-touch decision and their order are the real code.

const getUser = vi.fn(async () => ({ data: { user: null } }))

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

interface Visitor {
  /** What `x-vercel-ip-country` says. Absent means the header is missing, as it is in dev. */
  country?: string
  /** An already-recorded consent choice, if any. */
  consent?: 'granted' | 'denied'
  url?: string
}

/** Run the real proxy for an anonymous visitor and return every cookie it tried to set. */
async function visit(v: Visitor): Promise<Map<string, string>> {
  const headers = new Headers({ referer: 'https://news.example.com/story' })
  if (v.country) headers.set('x-vercel-ip-country', v.country)
  if (v.consent) headers.set('cookie', `fq_consent=${v.consent}`)
  const request = new NextRequest(v.url ?? 'https://frequencylocal.com/events/spring-social?utm_campaign=spring', {
    headers,
  })
  const response = await proxy(request)
  const set = new Map<string, string>()
  for (const cookie of response.cookies.getAll()) set.set(cookie.name, cookie.value)
  return set
}

/** The two writers OWN-061 names, together: the 90-day first-touch record and its channel hint. */
function attributionWrites(cookies: Map<string, string>): string[] {
  return ['fq_attr', 'fq_src'].filter((name) => (cookies.get(name) ?? '') !== '')
}

describe('🔴 the 90-day first-touch cookie is not written before a choice is recorded', () => {
  it('EU visitor, never asked: the edge writes NO attribution cookie', async () => {
    const cookies = await visit({ country: 'DE' })
    expect(
      attributionWrites(cookies),
      'HYG-048 attribution storage landed on an EU device before consent existed',
    ).toEqual([])
  })

  it('UK visitor, never asked: the edge writes NO attribution cookie', async () => {
    expect(attributionWrites(await visit({ country: 'GB' }))).toEqual([])
  })

  it('EU visitor who declined: still nothing', async () => {
    expect(attributionWrites(await visit({ country: 'FR', consent: 'denied' }))).toEqual([])
  })

  it('EU visitor who allowed: first-touch is captured, campaign and all', async () => {
    const cookies = await visit({ country: 'DE', consent: 'granted' })
    expect(attributionWrites(cookies)).toEqual(['fq_attr', 'fq_src'])
    const touch = JSON.parse(decodeURIComponent(cookies.get('fq_attr')!))
    expect(touch.landing).toBe('/events/spring-social')
    expect(touch.utm).toMatchObject({ campaign: 'spring' })
  })
})

describe('the banner is only offered where prior consent is the law', () => {
  it('an EU visitor is told to ask', async () => {
    expect((await visit({ country: 'IE' })).get('fq_ask')).toBe('1')
  })

  it('a US visitor is not', async () => {
    expect((await visit({ country: 'US' })).get('fq_ask') ?? '').toBe('')
  })

  it('a visitor who leaves the region has the marker cleared rather than left stale', async () => {
    const headers = new Headers({ 'x-vercel-ip-country': 'US', cookie: 'fq_ask=1' })
    const response = await proxy(new NextRequest('https://frequencylocal.com/', { headers }))
    const cleared = response.cookies.getAll().find((c) => c.name === 'fq_ask')
    expect(cleared?.value).toBe('')
  })
})

describe('🔴 NO REGRESSION: nothing changed for a visitor the law does not cover', () => {
  it('a US visitor who has never been asked still gets first-touch on arrival', async () => {
    const cookies = await visit({ country: 'US' })
    expect(
      attributionWrites(cookies),
      'the analytics default was silently changed for existing visitors',
    ).toEqual(['fq_attr', 'fq_src'])
  })

  it('a visitor with NO country header at all still gets first-touch (dev, tests, non-Vercel hosts)', async () => {
    expect(attributionWrites(await visit({}))).toEqual(['fq_attr', 'fq_src'])
  })

  it('the referral cookie a share link drops is unchanged — it is not analytics storage', async () => {
    const cookies = await visit({
      country: 'US',
      url: 'https://frequencylocal.com/p/someone?ref=0f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d',
    })
    expect(cookies.get('fq_ref')).toBe('0f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d')
  })
})
