import { describe, it, expect } from 'vitest'
import { requestSiteAddress, siteAddressState, starterSiteState } from './site-address'

const answer = (status: number) => (async () => new Response(null, { status })) as unknown as typeof fetch

describe('a starter site is live only when its address loads (VLS-04)', () => {
  it('is live on a 200', async () => {
    expect(await starterSiteState('alli', { fetchImpl: answer(200) })).toBe('live')
  })

  it('is finishing on anything else: not found, a redirect, a server error', async () => {
    for (const status of [404, 301, 502]) expect(await starterSiteState('alli', { fetchImpl: answer(status) }), String(status)).toBe('finishing')
  })

  it('is finishing when the address cannot be reached yet (certificate, DNS, timeout)', async () => {
    const down = (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
    expect(await starterSiteState('alli', { fetchImpl: down })).toBe('finishing')
  })

  it('looks at the free subdomain, and never calls a slug with no address live', async () => {
    const seen: string[] = []
    const spy = (async (url: string) => { seen.push(url); return new Response(null, { status: 200 }) }) as unknown as typeof fetch
    await starterSiteState('alli', { fetchImpl: spy })
    expect(seen).toEqual(['https://alli.frequencylocal.com/'])
    expect(await starterSiteState('admin', { fetchImpl: spy })).toBe('finishing')
    expect(await siteAddressState(null, { fetchImpl: spy })).toBe('finishing')
    expect(seen).toHaveLength(1)
  })
})

describe('requesting the address', () => {
  it('passes the free host to the attach call', async () => {
    const hosts: string[] = []
    const got = await requestSiteAddress('alli', async (h) => { hosts.push(h); return { ok: true } })
    expect(got).toEqual({ host: 'alli.frequencylocal.com', requested: true })
    expect(hosts).toEqual(['alli.frequencylocal.com'])
  })

  it('reports a refusal and a throw instead of hiding them', async () => {
    expect(await requestSiteAddress('alli', async () => ({ ok: false, error: 'not-configured' }))).toMatchObject({ requested: false, error: 'not-configured' })
    expect(await requestSiteAddress('alli', async () => { throw new Error('boom') })).toMatchObject({ requested: false, error: 'boom' })
  })

  it('skips a slug that cannot be a subdomain without calling Vercel', async () => {
    let called = false
    const got = await requestSiteAddress('www', async () => { called = true; return { ok: true } })
    expect(called).toBe(false)
    expect(got).toMatchObject({ host: null, requested: false })
  })
})
