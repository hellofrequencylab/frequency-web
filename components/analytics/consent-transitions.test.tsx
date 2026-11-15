// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ path: '/feed' }))
vi.mock('next/navigation', () => ({ usePathname: () => state.path, useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }))
import { GaConsentGate } from './ga-consent-gate'
import { PageViewTracker } from './track-provider'
import { updateBrowserAnalyticsPolicy } from '@/lib/analytics/browser-policy'
import { CookieBanner, OPEN_COOKIE_CHOICES_EVENT } from '@/components/consent/cookie-banner'

const browser = window as Window & { __fqAnalyticsAllowed?: boolean }
const google = vi.fn()
const beacon = vi.fn(() => true)
let root: Root
let node: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-POLICY0001')
  for (const pair of document.cookie.split(';')) document.cookie = `${pair.split('=')[0].trim()}=; path=/; max-age=0`
  localStorage.clear()
  google.mockClear(); beacon.mockClear(); state.path = '/feed'
  browser.__fqAnalyticsAllowed = true
  window.__fqGoogleEnabled = true
  browser.gtag = google
  delete (window as unknown as Record<string, unknown>)['ga-disable-G-POLICY0001']
  window.__fqGa = vi.fn()
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon })
  node = document.createElement('div'); document.body.appendChild(node); root = createRoot(node)
})
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('actual mounted consent gate synchronizes client tracking', () => {
  it('stops SPA/manual page events when account or real staff eligibility is revoked after initial allow', async () => {
    await act(async () => root.render(<><GaConsentGate disabled={false} /><PageViewTracker /></>))
    expect(beacon).toHaveBeenCalledOnce()
    google.mockClear(); beacon.mockClear()
    state.path = '/practices/private-practice'
    await act(async () => root.render(<><GaConsentGate disabled /><PageViewTracker /></>))
    expect(browser.__fqAnalyticsAllowed).toBe(false)
    expect((window as unknown as Record<string, unknown>)['ga-disable-G-POLICY0001']).toBe(true)
    expect(google).not.toHaveBeenCalled()
    expect(beacon).not.toHaveBeenCalled()
  })
  it('does not grant immediately after an account re-enable; it asks the existing resolver', async () => {
    await act(async () => root.render(<GaConsentGate disabled />))
    await act(async () => root.render(<GaConsentGate disabled={false} />))
    expect(window.__fqGa).toHaveBeenCalled()
    expect(browser.__fqAnalyticsAllowed).toBe(false)
  })
  it('keeps only the current page pending and emits it once after policy becomes eligible', async () => {
    browser.__fqAnalyticsAllowed = false
    await act(async () => root.render(<PageViewTracker />))
    expect(beacon).not.toHaveBeenCalled()
    state.path = '/events'
    await act(async () => root.render(<PageViewTracker />))
    browser.__fqAnalyticsAllowed = true
    await act(async () => window.dispatchEvent(new Event('fq-analytics-policy-ready')))
    await act(async () => window.dispatchEvent(new Event('fq-analytics-policy-ready')))
    expect(beacon).toHaveBeenCalledOnce()
    expect(google).toHaveBeenCalledWith('event', 'nav_page_view', { path: '/events' })
  })
  it('withdrawal synchronously invalidates the known flag even without a loaded tag', () => {
    updateBrowserAnalyticsPolicy(false)
    expect(browser.__fqAnalyticsAllowed).toBe(false)
    expect((window as unknown as Record<string, unknown>)['ga-disable-G-POLICY0001']).toBe(true)
    expect(JSON.parse(localStorage.getItem('fq-analytics-policy-update')!)).toMatchObject({ refresh: false })
  })
  it('a real decline click stops current tracking even when cookie persistence fails', async () => {
    await act(async () => root.render(<CookieBanner />))
    await act(async () => window.dispatchEvent(new Event(OPEN_COOKIE_CHOICES_EVENT)))
    const decline = [...node.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Decline')!
    const setter = vi.spyOn(document, 'cookie', 'set').mockImplementation(() => { throw Error('Cookies unavailable') })
    try {
      await act(async () => decline.click())
      expect(browser.__fqAnalyticsAllowed).toBe(false)
      expect((window as unknown as Record<string, unknown>)['ga-disable-G-POLICY0001']).toBe(true)
    } finally { setter.mockRestore() }
  })
})
