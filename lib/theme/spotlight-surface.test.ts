import { describe, expect, it } from 'vitest'
import { spotlightSurface } from '@/lib/theme/surface'
import { MEGA_SURFACES } from '@/lib/theme/mega-surfaces'

const prefs = { megaTheme: { theme: 'midnight' } }

describe('spotlightSurface', () => {
  it('is null below Business', () => {
    expect(spotlightSurface(prefs, 'free')).toBeNull()
    expect(spotlightSurface(prefs, null)).toBeNull()
  })
  it('hands Business the theme ground', () => {
    expect(spotlightSurface(prefs, 'business')).toBe(MEGA_SURFACES.midnight)
  })
  it('is null when the Space has no themed ground', () => {
    expect(spotlightSurface({}, 'business')).toBeNull()
  })
})
