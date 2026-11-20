import { describe, expect, it } from 'vitest'
import { circleCoverArt } from './cover-art'

const mindless = { type: 'business', cover_image_url: '/sites/mindless/photos/hero-yellow.jpg', brand_logo_url: '/sites/mindless/avatar.png' }

describe('circleCoverArt', () => {
  it('a Circle whose image is its Space logo gets the Space header behind and the logo on top', () => {
    expect(circleCoverArt('https://frequencylocal.com/sites/mindless/avatar.png', mindless)).toEqual({
      background: '/sites/mindless/photos/hero-yellow.jpg',
      logo: '/sites/mindless/avatar.png',
    })
  })
  it('a Space Circle with its own photo keeps the photo, with the Space logo over it', () => {
    expect(circleCoverArt('/uploads/sunrise.jpg', mindless)).toEqual({ background: '/uploads/sunrise.jpg', logo: '/sites/mindless/avatar.png' })
  })
  it('a Space Circle with no image wears the Space header and logo', () => {
    expect(circleCoverArt(null, mindless)).toEqual({ background: '/sites/mindless/photos/hero-yellow.jpg', logo: '/sites/mindless/avatar.png' })
  })
  it('a personal Circle has no logo and keeps its own image', () => {
    expect(circleCoverArt('/uploads/me.jpg', { type: 'root', brand_logo_url: '/x.png', cover_image_url: '/y.jpg' })).toEqual({ background: '/uploads/me.jpg', logo: null })
    expect(circleCoverArt(null, null)).toEqual({ background: null, logo: null })
  })
})
