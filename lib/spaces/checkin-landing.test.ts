import { describe, expect, it } from 'vitest'
import { spaceCheckinHref } from './checkin-landing'

describe('spaceCheckinHref', () => {
  it('carries the node, its signature and the tap marker to the Space page', () => {
    expect(spaceCheckinHref('house-of-fates', 'n-1', 'v1.abc.def', 'nfc')).toBe('/spaces/house-of-fates?checkin=n-1&s=v1.abc.def&m=nfc')
  })

  it('leaves out what the node link did not carry', () => {
    expect(spaceCheckinHref('house-of-fates', 'n-1', null, null)).toBe('/spaces/house-of-fates?checkin=n-1')
  })
})
