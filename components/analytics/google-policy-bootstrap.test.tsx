// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateBrowserAnalyticsPolicy } from '@/lib/analytics/browser-policy'
import { trackClient } from './track-provider'
const waitFor = vi.waitFor

const gaId = 'G-POLICY0001'
const selector = 'script[src*="googletagmanager.com"]'
type PolicyWindow = Window & { __fqAnalyticsAllowed?: boolean; __fqGa?: () => void; dataLayer?: Array<ArrayLike<unknown>>; gtag?: unknown }
const browser = window as PolicyWindow
const pending = () => {
  let resolve!: (value: Response) => void
  const promise = new Promise<Response>(done => { resolve = done })
  return { promise, resolve }
}
async function boot() {
  vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', gaId)
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.resetModules()
  const { GoogleAnalytics } = await import('./google-analytics')
  const element = GoogleAnalytics()!
  new Function(element.props.dangerouslySetInnerHTML.__html)()
}
function cookie(value: string) { document.cookie = `${value}; path=/` }
beforeEach(() => {
  for (const pair of document.cookie.split(';')) document.cookie = `${pair.split('=')[0].trim()}=; path=/; max-age=0`
  document.head.querySelectorAll(selector).forEach(node => node.remove())
  delete browser.__fqGa
  delete window.__fqGoogleEnabled
  delete browser.__fqAnalyticsAllowed
  delete browser.dataLayer
  delete browser.gtag
  delete (window as unknown as Record<string, unknown>)[`ga-disable-${gaId}`]
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  document.title = 'Frequency'
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('actual production Google head waits for browser AND real request policy', () => {
  it('queues no Google config or loader until the real policy answers yes', async () => {
    const response = pending()
    const fetcher = vi.fn<typeof fetch>(() => response.promise)
    vi.stubGlobal('fetch', fetcher)
    await boot()
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0][0]).toBe('/api/analytics/policy')
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store' })
    expect(document.head.querySelector(selector)).toBeNull()
    expect(browser.dataLayer ?? []).toHaveLength(0)
    expect(browser.__fqAnalyticsAllowed).toBe(false)
    response.resolve(Response.json({ allowed: true }))
    await waitFor(() => expect(document.head.querySelectorAll(selector)).toHaveLength(1))
    expect(browser.__fqAnalyticsAllowed).toBe(true)
    expect(typeof browser.gtag).toBe('function')
    expect((browser.dataLayer ?? []).map(call => Array.from(call)).filter(call => call[0] === 'config')).toHaveLength(1)
  })
  it.each([false, null, undefined, 'true'])('does not interpret policy %s as eligible', async allowed => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ allowed })))
    await boot()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.head.querySelector(selector)).toBeNull()
    expect(browser.__fqAnalyticsAllowed).toBe(false)
    expect(browser.gtag).toBeUndefined()
  })
  it('explicit browser decline never requests policy and cannot be bypassed by the exposed loader', async () => {
    cookie('fq_consent=denied')
    const fetcher = vi.fn(async () => Response.json({ allowed: true }))
    vi.stubGlobal('fetch', fetcher)
    await boot()
    browser.__fqGa?.()
    expect(fetcher).not.toHaveBeenCalled()
    expect(document.head.querySelector(selector)).toBeNull()
  })
  it('prior-consent visitors must grant before policy is requested', async () => {
    cookie('fq_ask=1')
    const fetcher = vi.fn(async () => Response.json({ allowed: true }))
    vi.stubGlobal('fetch', fetcher)
    await boot()
    expect(fetcher).not.toHaveBeenCalled()
    cookie('fq_consent=granted')
    browser.__fqGa?.()
    await waitFor(() => expect(document.head.querySelectorAll(selector)).toHaveLength(1))
  })
  it('does not revive a grant revoked while the request was in flight', async () => {
    cookie('fq_consent=granted')
    const response = pending()
    vi.stubGlobal('fetch', vi.fn(() => response.promise))
    await boot()
    cookie('fq_consent=denied')
    response.resolve(Response.json({ allowed: true }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.head.querySelector(selector)).toBeNull()
    expect(browser.__fqAnalyticsAllowed).toBe(false)
  })
  it.each(['reject', 'http', 'malformed'])('fails closed on %s policy evidence', async mode => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (mode === 'reject') throw Error('unavailable')
      if (mode === 'http') return new Response('', { status: 503 })
      return new Response('not-json')
    }))
    await boot()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.head.querySelector(selector)).toBeNull()
    expect(browser.__fqAnalyticsAllowed).toBe(false)
  })
  it('deduplicates in-flight policy requests and the actual loader', async () => {
    const response = pending()
    const fetcher = vi.fn<typeof fetch>(() => response.promise)
    vi.stubGlobal('fetch', fetcher)
    await boot()
    browser.__fqGa?.(); browser.__fqGa?.()
    expect(fetcher).toHaveBeenCalledOnce()
    response.resolve(Response.json({ allowed: true }))
    await waitFor(() => expect(document.head.querySelectorAll(selector)).toHaveLength(1))
    browser.__fqGa?.()
    await waitFor(() => expect(document.head.querySelectorAll(selector)).toHaveLength(1))
  })
  it('preserves only closed campaign attribution while redacting private names and referrers', async () => {
    window.history.replaceState(null, '', '/journeys/private-circle?utm_source=email&utm_medium=email&utm_campaign=123&utm_term=private@example.test&email=private@example.test')
    document.title = 'Private practice and person'
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('https://outside.example/private-person?email=private@example.test')
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ allowed: true })))
    await boot()
    await waitFor(() => expect(document.head.querySelector(selector)).not.toBeNull())
    const config = (browser.dataLayer ?? []).map(call => Array.from(call)).find(call => call[0] === 'config')?.[2] as Record<string, unknown>
    expect(config.page_location).toBe(`${location.origin}/journeys/[slug]?utm_source=email&utm_medium=email&utm_campaign=123`)
    expect(config.page_title).toBe('Frequency')
    expect(config.page_referrer).toBe('https://outside.example/')
    expect(JSON.stringify(config)).not.toMatch(/private-circle|private-person|private@example|Private practice/)
  })
  it.each(['local', 'cookie'])('keeps a persisted %s staff/browser suppression out before configuration', async kind => {
    if (kind === 'local') localStorage.setItem('freq-ga-optout', '1')
    else cookie('fq_ga_optout=1')
    const fetcher = vi.fn(async () => Response.json({ allowed: true }))
    vi.stubGlobal('fetch', fetcher)
    await boot()
    expect(fetcher).not.toHaveBeenCalled()
    expect(document.head.querySelector(selector)).toBeNull()
  })
  it('a late initial grant cannot override an account withdrawal or a newer denied response', async () => {
    const old = pending(), fresh = pending()
    const fetcher = vi.fn<typeof fetch>().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
    vi.stubGlobal('fetch', fetcher)
    await boot()
    updateBrowserAnalyticsPolicy(false)
    updateBrowserAnalyticsPolicy(true)
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    old.resolve(Response.json({ allowed: true }))
    fresh.resolve(Response.json({ allowed: false }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.head.querySelector(selector)).toBeNull()
    expect(browser.__fqAnalyticsAllowed).toBe(false)
  })
  it('cross-tab withdrawal stops an already configured tag and client events immediately', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ allowed: true })))
    await boot()
    await waitFor(() => expect(document.head.querySelector(selector)).not.toBeNull())
    const before = browser.dataLayer!.length
    window.dispatchEvent(new StorageEvent('storage', { key: 'fq-analytics-policy-update', newValue: JSON.stringify({ refresh: false }) }))
    expect(browser.__fqAnalyticsAllowed).toBe(false)
    expect((window as unknown as Record<string, unknown>)[`ga-disable-${gaId}`]).toBe(true)
    trackClient('nav.page_view', { path: '/feed' })
    expect(browser.dataLayer).toHaveLength(before)
  })
  it('bounds a hanging policy request and never revives its late answer', async () => {
    vi.useFakeTimers()
    try {
      const response = pending()
      const fetcher = vi.fn<typeof fetch>(() => response.promise)
      vi.stubGlobal('fetch', fetcher)
      await boot()
      await vi.advanceTimersByTimeAsync(4001)
      expect(browser.__fqAnalyticsAllowed).toBe(false)
      expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true)
      response.resolve(Response.json({ allowed: true }))
      await vi.advanceTimersByTimeAsync(0)
      expect(document.head.querySelector(selector)).toBeNull()
      expect(browser.__fqAnalyticsAllowed).toBe(false)
    } finally { vi.useRealTimers() }
  })
  it('also bounds an invalidated hanging request without stopping a newer grant', async () => {
    vi.useFakeTimers()
    try {
      const stale = pending()
      const fetcher = vi.fn<typeof fetch>().mockReturnValueOnce(stale.promise).mockResolvedValueOnce(Response.json({ allowed: true }))
      vi.stubGlobal('fetch', fetcher)
      await boot()
      updateBrowserAnalyticsPolicy(false)
      updateBrowserAnalyticsPolicy(true)
      await vi.advanceTimersByTimeAsync(0)
      expect(browser.__fqAnalyticsAllowed).toBe(true)
      await vi.advanceTimersByTimeAsync(4001)
      expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true)
      expect(browser.__fqAnalyticsAllowed).toBe(true)
      expect(document.head.querySelectorAll(selector)).toHaveLength(1)
    } finally { vi.useRealTimers() }
  })
  it.each([['G-POLICY0001', 'preview'], ['', 'production']])('keeps permitted first-party telemetry independent of Google (%s / %s)', async (id, env) => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', id)
    vi.stubEnv('VERCEL_ENV', env)
    vi.resetModules()
    const tags = await import('./google-analytics')
    expect(tags.GoogleAnalytics()).toBeNull()
    const element = tags.FirstPartyAnalyticsPolicy()!
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ allowed: true })))
    new Function(element.props.dangerouslySetInnerHTML.__html)()
    await waitFor(() => expect(browser.__fqAnalyticsAllowed).toBe(true))
    expect(window.__fqGoogleEnabled).toBe(false)
    expect(document.head.querySelector(selector)).toBeNull()
    expect(browser.gtag).toBeUndefined()
    expect(browser.dataLayer ?? []).toHaveLength(0)
    const beacon = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon })
    // An account re-grant first suppresses old hits, then requires this fallback's fresh decision.
    updateBrowserAnalyticsPolicy(false)
    updateBrowserAnalyticsPolicy(true)
    await waitFor(() => expect(browser.__fqAnalyticsAllowed).toBe(true))
    trackClient('nav.page_view', { path: '/feed' })
    expect(beacon).toHaveBeenCalledOnce()
    expect(window.__fqGoogleEnabled).toBe(false)
    expect(document.head.querySelector(selector)).toBeNull()
  })
})
