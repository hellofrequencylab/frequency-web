// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
vi.mock('next/navigation', () => ({ usePathname: () => '/' }))
import { trackClient } from './track-provider'

const beacon = vi.fn(() => true)
beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon })
  window.gtag = vi.fn()
})
afterEach(() => { delete window.gtag })

it('records semantic navigation first-party while bootstrap exclusively owns GA page views', () => {
  trackClient('nav.page_view', { path: '/pricing' })
  expect(beacon).toHaveBeenCalledTimes(1)
  expect(window.gtag).not.toHaveBeenCalled()
})
it('rejects client-spoofed authoritative or unknown events before either destination', () => {
  trackClient('lead.captured', { source: 'create_space' })
  trackClient('commerce.purchase', { value: 100 })
  trackClient('invented.event')
  expect(beacon).not.toHaveBeenCalled()
  expect(window.gtag).not.toHaveBeenCalled()
})
it('a broken external tag cannot break the first-party event or the user action', () => {
  window.gtag = () => { throw new Error('tag unavailable') }
  expect(() => trackClient('feature.used', { feature: 'builder' })).not.toThrow()
  expect(beacon).toHaveBeenCalledTimes(1)
})
