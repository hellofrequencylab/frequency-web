import { describe, it, expect } from 'vitest'
import { gaEventName, gaServerEnabled, sendGa4Event } from './ga-server'

describe('ga-server', () => {
  it('normalizes dotted taxonomy names to GA4 snake_case', () => {
    expect(gaEventName('qr.scanned')).toBe('qr_scanned')
    expect(gaEventName('qr.referral_signup')).toBe('qr_referral_signup')
    expect(gaEventName('nav.page_view')).toBe('nav_page_view')
  })

  it('is inert without configuration (no env in test)', () => {
    expect(gaServerEnabled()).toBe(false)
  })

  it('no-ops (resolves, never throws) when GA is not configured', async () => {
    await expect(sendGa4Event('qr.scanned', { purpose: 'connect' }, 'p1')).resolves.toBeUndefined()
  })
})
