// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackClient } from './track-provider'

type PolicyWindow = Window & { __fqAnalyticsAllowed?: boolean; gtag?: (...args: unknown[]) => void }
const browser = window as PolicyWindow
const google = vi.fn()
const beacon = vi.fn(() => true)
beforeEach(() => {
  for (const pair of document.cookie.split(';')) document.cookie = `${pair.split('=')[0].trim()}=; path=/; max-age=0`
  vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-POLICY0001')
  window.__fqGoogleEnabled = true
  browser.gtag = google
  delete browser.__fqAnalyticsAllowed
  delete (window as unknown as Record<string, unknown>)['ga-disable-G-POLICY0001']
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon })
  google.mockClear(); beacon.mockClear(); localStorage.clear()
})
afterEach(() => vi.unstubAllEnvs())
describe('actual client tracker checks current browser and verified request policy', () => {
  it.each([undefined, false])('drops Google AND member beacons before positive policy (%s)', allowed => {
    browser.__fqAnalyticsAllowed = allowed
    trackClient('nav.page_view', { path: '/feed' })
    expect(google).not.toHaveBeenCalled()
    expect(beacon).not.toHaveBeenCalled()
  })
  it('sends a permitted event through both existing transports', () => {
    browser.__fqAnalyticsAllowed = true
    trackClient('nav.page_view', { path: '/feed' })
    expect(google).toHaveBeenCalledWith('event', 'nav_page_view', { path: '/feed' })
    expect(beacon).toHaveBeenCalledOnce()
  })
  it('keeps the first-party sink available without enabling a Google mirror', () => {
    browser.__fqAnalyticsAllowed = true
    window.__fqGoogleEnabled = false
    trackClient('nav.page_view', { path: '/feed' })
    expect(google).not.toHaveBeenCalled()
    expect(beacon).toHaveBeenCalledOnce()
  })
  it('browser withdrawal wins even with a stale positive policy and existing global tag', () => {
    browser.__fqAnalyticsAllowed = true
    document.cookie = 'fq_consent=denied; path=/'
    trackClient('nav.page_view', { path: '/feed' })
    expect(google).not.toHaveBeenCalled()
    expect(beacon).not.toHaveBeenCalled()
  })
  it('does not reinterpret undecided prior-consent traffic as consent', () => {
    browser.__fqAnalyticsAllowed = true
    document.cookie = 'fq_ask=1; path=/'
    trackClient('nav.page_view', { path: '/feed' })
    expect(google).not.toHaveBeenCalled()
    expect(beacon).not.toHaveBeenCalled()
  })
  it.each(['native', 'local', 'cookie'])('honors %s suppression after a previous grant', kind => {
    browser.__fqAnalyticsAllowed = true
    if (kind === 'native') (window as unknown as Record<string, unknown>)['ga-disable-G-POLICY0001'] = true
    if (kind === 'local') localStorage.setItem('freq-ga-optout', '1')
    if (kind === 'cookie') document.cookie = 'fq_ga_optout=1; path=/'
    trackClient('nav.page_view', { path: '/feed' })
    expect(google).not.toHaveBeenCalled()
    expect(beacon).not.toHaveBeenCalled()
  })
})
