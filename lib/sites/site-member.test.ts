import { describe, expect, it } from 'vitest'
import { siteMembershipLine, siteMemberOrigin } from './site-member'

describe('the website membership badge', () => {
  it("names the reader's tier in this Space and nothing when there is none", () => {
    expect(siteMembershipLine(null)).toBeNull()
    expect(siteMembershipLine({ tierName: '  ', status: 'active' })).toBeNull()
    expect(siteMembershipLine({ tierName: 'Circle', status: 'active' })).toBe('Member · Circle')
    expect(siteMembershipLine({ tierName: 'Circle', status: 'waitlist' })).toBe('Waitlist · Circle')
  })

  it("grants credentials only to the Space's own https website hosts", () => {
    const hosts = ['heart.frequencylocal.com', 'heartonfire.org', null]
    expect(siteMemberOrigin('https://heart.frequencylocal.com', hosts)).toBe('https://heart.frequencylocal.com')
    expect(siteMemberOrigin('https://HeartOnFire.org', hosts)).toBe('https://heartonfire.org')
    expect(siteMemberOrigin('http://heart.frequencylocal.com', hosts)).toBeNull()
    expect(siteMemberOrigin('https://other.frequencylocal.com', hosts)).toBeNull()
    expect(siteMemberOrigin('https://heartonfire.org.evil.com', hosts)).toBeNull()
    expect(siteMemberOrigin('null', hosts)).toBeNull()
    expect(siteMemberOrigin(null, hosts)).toBeNull()
  })
})
