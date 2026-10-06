import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  buyDomain,
  classifyFailure,
  getDomainAvailability,
  getDomainOrder,
  getDomainPrice,
  parseRegistrantContact,
  registrarConfigured,
  type RegistrantContact,
} from './registrar'

// The Vercel registrar client (LIVE-781): typed results, never a throw, and the token kept out of logs.

const TOKEN = 'vercel_test_token_secret'

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

const CONTACT: RegistrantContact = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.test',
  phone: '+14155550123',
  address1: '1 Main St',
  city: 'Portland',
  state: 'OR',
  zip: '97201',
  country: 'US',
}

beforeEach(() => {
  vi.stubEnv('VERCEL_API_TOKEN', TOKEN)
  vi.stubEnv('VERCEL_PROJECT_ID', 'prj_test')
  vi.stubEnv('VERCEL_TEAM_ID', 'team_test')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('configuration', () => {
  it('is not configured without the platform token, and says so instead of calling out', async () => {
    vi.stubEnv('VERCEL_API_TOKEN', '')
    expect(registrarConfigured()).toBe(false)
    const f = fakeFetch(200, { available: true })
    await expect(getDomainAvailability('example.com', f)).resolves.toEqual({ ok: false, error: 'not-configured' })
    expect(f).not.toHaveBeenCalled()
  })
})

describe('getDomainAvailability', () => {
  it('reads { available } and scopes the call to the team with the bearer token', async () => {
    const f = fakeFetch(200, { available: true })
    await expect(getDomainAvailability('example.com', f)).resolves.toEqual({ ok: true, data: { available: true } })
    const [url, init] = f.mock.calls[0]
    expect(String(url)).toBe('https://api.vercel.com/v1/registrar/domains/example.com/availability?teamId=team_test')
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('treats a body without a boolean as an upstream fault', async () => {
    await expect(getDomainAvailability('example.com', fakeFetch(200, { available: 'yes' }))).resolves.toEqual({
      ok: false,
      error: 'upstream',
    })
  })

  it('never throws when the network fails, and never logs the token', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = vi.fn(async () => {
      throw new Error('socket hang up')
    })
    await expect(getDomainAvailability('example.com', f as unknown as typeof fetch)).resolves.toEqual({ ok: false, error: 'network' })
    expect(JSON.stringify(err.mock.calls)).not.toContain(TOKEN)
  })
})

describe('getDomainPrice', () => {
  it('converts Vercel dollars (string or number) to cents', async () => {
    const r = await getDomainPrice('example.com', fakeFetch(200, { years: 1, purchasePrice: '11.25', renewalPrice: 13 }))
    expect(r).toEqual({ ok: true, data: { years: 1, purchaseCents: 1125, renewalCents: 1300 } })
  })

  it('asks for one year', async () => {
    const f = fakeFetch(200, { years: 1, purchasePrice: 10 })
    await getDomainPrice('example.com', f)
    expect(String(f.mock.calls[0][0])).toContain('/price?years=1&teamId=team_test')
  })

  it('a TLD with a longer minimum term is unsupported (one yearly price only)', async () => {
    await expect(getDomainPrice('example.ai', fakeFetch(200, { years: 2, purchasePrice: 140 }))).resolves.toEqual({
      ok: false,
      error: 'unsupported',
    })
  })

  it('a missing price is an upstream fault, not a free domain', async () => {
    await expect(getDomainPrice('example.com', fakeFetch(200, { years: 1 }))).resolves.toEqual({ ok: false, error: 'upstream' })
  })

  it('maps a rate limit', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await getDomainPrice('example.com', fakeFetch(429, { error: { code: 'rate_limited' } }))
    expect(r).toMatchObject({ ok: false, error: 'rate-limited' })
  })
})

describe('buyDomain', () => {
  it('posts one year at the expected Vercel price in dollars with the registrant, and returns the order id', async () => {
    const f = fakeFetch(200, { orderId: 'ord_123', _links: {} })
    const r = await buyDomain('example.com', { expectedPriceCents: 1125, autoRenew: false, contact: { ...CONTACT, address2: '' } }, f)
    expect(r).toEqual({ ok: true, data: { orderId: 'ord_123' } })
    const [url, init] = f.mock.calls[0]
    expect(String(url)).toBe('https://api.vercel.com/v1/registrar/domains/example.com/buy?teamId=team_test')
    expect(init?.method).toBe('POST')
    const body = JSON.parse(String(init?.body))
    expect(body).toMatchObject({ years: 1, autoRenew: false, expectedPrice: 11.25 })
    expect(body.contactInformation.firstName).toBe('Ada')
    // An empty optional field is dropped: Vercel rejects an empty string.
    expect('address2' in body.contactInformation).toBe(false)
  })

  it('a moved price is a typed refusal, and no registrant detail reaches the log', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await buyDomain(
      'example.com',
      { expectedPriceCents: 1125, autoRenew: false, contact: CONTACT },
      fakeFetch(400, { error: { code: 'price_mismatch', message: 'expected price does not match' } }),
    )
    expect(r).toMatchObject({ ok: false, error: 'price-changed' })
    const logged = JSON.stringify(err.mock.calls)
    expect(logged).not.toContain('ada@example.test')
    expect(logged).not.toContain(TOKEN)
  })

  it('a response with no order id is an upstream fault', async () => {
    const r = await buyDomain('example.com', { expectedPriceCents: 1125, autoRenew: true, contact: CONTACT }, fakeFetch(200, {}))
    expect(r).toEqual({ ok: false, error: 'upstream' })
  })
})

describe('getDomainOrder', () => {
  it('reads the order status and folds anything new to unknown', async () => {
    await expect(getDomainOrder('ord_1', fakeFetch(200, { orderId: 'ord_1', status: 'completed', domains: [] }))).resolves.toEqual({
      ok: true,
      data: { status: 'completed' },
    })
    await expect(getDomainOrder('ord_1', fakeFetch(200, { status: 'something-new' }))).resolves.toEqual({
      ok: true,
      data: { status: 'unknown' },
    })
  })
})

describe('classifyFailure', () => {
  it('maps the failures the app acts on', () => {
    expect(classifyFailure(409, '')).toBe('unavailable')
    expect(classifyFailure(400, 'domain_not_available')).toBe('unavailable')
    expect(classifyFailure(400, 'invalid_contact_information')).toBe('contact-invalid')
    expect(classifyFailure(400, 'tld_not_supported')).toBe('unsupported')
    expect(classifyFailure(500, '')).toBe('upstream')
  })
})

describe('parseRegistrantContact', () => {
  it('cleans and normalises what the owner typed', () => {
    const r = parseRegistrantContact({ ...CONTACT, phone: '+1 (415) 555-0123', email: ' Ada@Example.test ', country: 'us', address2: '' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.contact.phone).toBe('+14155550123')
    expect(r.contact.email).toBe('ada@example.test')
    expect(r.contact.country).toBe('US')
    expect('address2' in r.contact).toBe(false)
  })

  it('says plainly what is missing', () => {
    expect(parseRegistrantContact({ ...CONTACT, lastName: '' })).toMatchObject({ ok: false })
    expect(parseRegistrantContact({ ...CONTACT, email: 'not-an-email' })).toMatchObject({ ok: false })
    expect(parseRegistrantContact({ ...CONTACT, phone: '5550123' })).toMatchObject({ ok: false })
    expect(parseRegistrantContact({ ...CONTACT, zip: '' })).toMatchObject({ ok: false })
    expect(parseRegistrantContact({ ...CONTACT, country: 'USA' })).toMatchObject({ ok: false })
    expect(parseRegistrantContact(null)).toMatchObject({ ok: false })
  })
})
