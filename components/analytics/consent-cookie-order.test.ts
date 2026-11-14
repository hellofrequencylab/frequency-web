// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gaBootstrapScript } from '@/lib/consent/cookie-consent'

const selector = 'script[src*="googletagmanager.com"]'
beforeEach(() => {
  localStorage.clear()
  document.head.querySelectorAll(selector).forEach(node => node.remove())
  window.__fqAnalyticsAllowed = false
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('actual generated browser-law parser is independent of cookie order', () => {
  it.each([
    '_ga=GA1.1.123.456; fq_consent=denied; unrelated=1',
    'unrelated=1; _ga=GA1.1.123.456; fq_consent=denied',
    'unrelated=1; fq_ask=1',
    '_ga=GA1.1.123.456; unrelated=1; fq_ask=1',
    'fq_consent=granted; unrelated=1; fq_ga_optout=1',
  ])('does not request policy or load Google for %s', cookieHeader => {
    vi.spyOn(document, 'cookie', 'get').mockReturnValue(cookieHeader)
    const request = vi.fn(async () => Response.json({ allowed: true }))
    vi.stubGlobal('fetch', request)
    new Function(gaBootstrapScript('G-ORDER0001', true))()
    expect(request).not.toHaveBeenCalled()
    expect(document.head.querySelector(selector)).toBeNull()
    expect(window.__fqAnalyticsAllowed).toBe(false)
  })
  it('an explicit grant still wins over a later prior-consent marker', async () => {
    vi.spyOn(document, 'cookie', 'get').mockReturnValue('fq_consent=granted; unrelated=1; fq_ask=1')
    const request = vi.fn(async () => Response.json({ allowed: true }))
    vi.stubGlobal('fetch', request)
    new Function(gaBootstrapScript('G-ORDER0001', true))()
    await vi.waitFor(() => expect(document.head.querySelector(selector)).not.toBeNull())
    expect(request).toHaveBeenCalledOnce()
    expect(window.__fqAnalyticsAllowed).toBe(true)
  })
})
