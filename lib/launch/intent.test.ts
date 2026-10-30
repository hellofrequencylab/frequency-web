import { describe, expect, it } from 'vitest'
import { PERSONAL_SPOTLIGHT_HREF, showIntent } from './intent'

describe('showIntent', () => {
  it('asks a fresh launch with no Space', () => {
    expect(showIntent({ spaceId: null, made: [] })).toBe(true)
    expect(showIntent({ spaceId: undefined, made: [] })).toBe(true)
  })
  it('does not ask once something is made or a Space is attached', () => {
    expect(showIntent({ spaceId: null, made: ['Spotlight'] })).toBe(false)
    expect(showIntent({ spaceId: 's1', made: [] })).toBe(false)
  })
  it('sends the personal choice to the member\'s own profile, a route that exists', () => {
    expect(PERSONAL_SPOTLIGHT_HREF).toBe('/profile')
  })
})
