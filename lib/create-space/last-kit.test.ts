import { describe, expect, it } from 'vitest'
import { lastKitFrom } from './last-kit'

describe('lastKitFrom', () => {
  it('reads an offered kit out of a cookie string', () => {
    expect(lastKitFrom('a=1; fq_last_kit=new-world; b=2')).toBe('new-world')
  })
  it('drops a hidden or unknown kit, and a missing cookie', () => {
    // CyberWitch was the hidden kit here until #4636 offered it; the old Temple id is a real theme no picker offers.
    expect(lastKitFrom('fq_last_kit=temple')).toBeNull()
    expect(lastKitFrom('fq_last_kit=nope')).toBeNull()
    expect(lastKitFrom(null)).toBeNull()
  })
})
