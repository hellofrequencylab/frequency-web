import { describe, expect, it } from 'vitest'
import { lastKitFrom } from './last-kit'

describe('lastKitFrom', () => {
  it('reads an offered kit out of a cookie string', () => {
    expect(lastKitFrom('a=1; fq_last_kit=new-world; b=2')).toBe('new-world')
  })
  it('drops a hidden or unknown kit, and a missing cookie', () => {
    expect(lastKitFrom('fq_last_kit=free-human')).toBeNull()
    expect(lastKitFrom('fq_last_kit=nope')).toBeNull()
    expect(lastKitFrom(null)).toBeNull()
  })
})
