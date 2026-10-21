import { describe, expect, it } from 'vitest'
import { clientSiteEntitlements } from './client-sites'

describe('clientSiteEntitlements', () => {
  it('opens Business depth and the custom domain, keeps the operator defaults', () => {
    const e = clientSiteEntitlements({ events: true, crm: false })
    expect(e.custom_domain).toBe(true)
    expect(e.events).toBe(true)
    expect(Object.keys(e).length).toBeGreaterThan(2)
  })
  it('never grants badge removal at birth, even if a default carried it', () => {
    expect(clientSiteEntitlements({ badge_removal: true })).not.toHaveProperty('badge_removal')
  })
})
