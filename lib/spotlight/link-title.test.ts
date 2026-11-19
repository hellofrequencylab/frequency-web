import { describe, expect, it } from 'vitest'
import { suggestLinkTitle } from './link-title'

describe('suggestLinkTitle', () => {
  it('names the big networks', () => {
    expect(suggestLinkTitle('https://www.instagram.com/danieltyack')).toBe('Instagram')
    expect(suggestLinkTitle('https://youtu.be/abc')).toBe('YouTube')
    expect(suggestLinkTitle('https://x.com/a')).toBe('X')
  })
  it('falls back to the site address, and to nothing for a half-typed one', () => {
    expect(suggestLinkTitle('https://danieltyack.com/about')).toBe('danieltyack.com')
    expect(suggestLinkTitle('https://local')).toBe('')
    expect(suggestLinkTitle('danieltyack')).toBe('')
  })
})
