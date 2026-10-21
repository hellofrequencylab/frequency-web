import { describe, expect, it } from 'vitest'
import { clientSiteBillLines, clientSiteDomainState, clientSiteEntitlements } from './client-sites'

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

describe('clientSiteDomainState', () => {
  it('reads none, live and pending', () => {
    expect(clientSiteDomainState(null, false)).toBe('none')
    expect(clientSiteDomainState('shop.example.com', true)).toBe('live')
    expect(clientSiteDomainState('shop.example.com', false)).toBe('pending')
  })
})

describe('clientSiteBillLines', () => {
  it('is empty with no sites', () => expect(clientSiteBillLines(0, 0)).toEqual([]))
  it('charges $39 a site for the first ten', () => {
    const lines = clientSiteBillLines(3, 0)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ count: 3, unitCents: 3900, totalCents: 11700 })
  })
  it('steps down to $29 and $19 and adds badge removal', () => {
    const lines = clientSiteBillLines(30, 2)
    expect(lines.map((l) => l.count)).toEqual([10, 15, 5, 2])
    expect(lines.reduce((sum, l) => sum + l.totalCents, 0)).toBe(10 * 3900 + 15 * 2900 + 5 * 1900 + 2 * 1500)
  })
  it('never lets badge removal outnumber the sites', () => {
    expect(clientSiteBillLines(1, 5).at(-1)?.count).toBe(1)
  })
})
