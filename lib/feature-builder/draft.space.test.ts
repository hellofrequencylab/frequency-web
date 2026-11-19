import { describe, expect, it } from 'vitest'
import { handleFrom, spaceTypeFrom } from './draft'

describe('Space builder answers', () => {
  it('makes a safe handle from what was typed, else the name', () => {
    expect(handleFrom('', 'Sunrise Run Club')).toBe('sunrise-run-club')
    expect(handleFrom('My Club!', 'x')).toBe('my-club')
    expect(handleFrom('', 'Café Ñu')).toBe('cafe-nu')
    expect(handleFrom('', 'A')).toBe('a-space')
    expect(handleFrom('', '!!!')).toBe('my-space')
    expect(handleFrom('x'.repeat(60), '').length).toBeLessThanOrEqual(40)
  })
  it('names one of the two provisionable types', () => {
    expect(spaceTypeFrom('nonprofit')).toBe('nonprofit')
    expect(spaceTypeFrom('anything')).toBe('business')
    expect(spaceTypeFrom(undefined)).toBe('business')
  })
})
