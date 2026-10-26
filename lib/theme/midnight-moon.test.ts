import { describe, expect, it } from 'vitest'
import { midnightMoon } from './midnight-moon'

describe('midnightMoon', () => {
  it('names the new moon of 6 January 2000 and the full moon two weeks on', () => {
    expect(midnightMoon(new Date(Date.UTC(2000, 0, 6, 18, 14))).name).toBe('New moon')
    expect(midnightMoon(new Date(Date.UTC(2000, 0, 21, 4, 40))).name).toBe('Full moon')
  })
  it('walks waxing before full and waning after', () => {
    expect(midnightMoon(new Date(Date.UTC(2000, 0, 10))).name).toBe('Waxing crescent')
    expect(midnightMoon(new Date(Date.UTC(2000, 0, 26))).name).toBe('Waning gibbous')
  })
})
