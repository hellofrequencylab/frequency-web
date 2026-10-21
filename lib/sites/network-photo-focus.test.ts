import { describe, expect, it } from 'vitest'
import { photoFocus } from './network-photo-focus'

describe('photoFocus', () => {
  it('keeps the owner point over everything', () => {
    expect(photoFocus('/brand/the-group/photos/june-hug.jpg', '40% 10%')).toBe('40% 10%')
  })
  it('knows where the faces sit in a shipped photo', () => {
    expect(photoFocus('/brand/the-group/photos/june-hug.jpg')).toBe('55% 22%')
    expect(photoFocus('https://cdn.example/x/founder-june-an.jpg?v=2')).toBe('55% 6%')
  })
  it('ignores a malformed owner point and an unknown photo', () => {
    expect(photoFocus('/a/unknown.jpg', 'url(x)')).toBeUndefined()
    expect(photoFocus(null)).toBeUndefined()
  })
})
