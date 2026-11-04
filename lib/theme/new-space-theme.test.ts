import { describe, expect, it } from 'vitest'
import { NEW_SPACE_THEME } from './mega-theme'
import { megaThemeSurfaces } from './apply-mega-theme'
import { NEW_WORLD_ACCENTS, NEW_WORLD_SURFACE } from './new-world'
import { emailSurface } from './surface'
import { readSiteStyle } from './site-style'

// LIVE-2058 (owner 2026-11-03): every new Space starts in New World with the Tide accent, its email wearing New World.
// A write at birth only: a Space that never saved a theme still reads as Frequency.
describe('the theme every new Space starts in', () => {
  it('is New World, with Tide on the Space page and New World email', () => {
    expect(NEW_SPACE_THEME).toBe('new-world')
    const s = megaThemeSurfaces(NEW_SPACE_THEME)
    expect(s.website).toBe('new-world')
    expect(s.spacePage.accent).toBe(NEW_WORLD_ACCENTS.tide.accent)
    expect(s.email).toBe(true)
    expect(emailSurface({ megaTheme: { theme: NEW_SPACE_THEME } })).toBe(NEW_WORLD_SURFACE)
  })
  it('leaves Spaces that never saved a theme on the Frequency look', () => {
    expect(readSiteStyle({}).theme).toBe('frequency')
  })
})
