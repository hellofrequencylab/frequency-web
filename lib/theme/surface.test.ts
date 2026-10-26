import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/spaces/accent'
import { MIDNIGHT_SURFACE } from './midnight'
import { emailSurface, pageSurface } from './surface'
import { surfaceCssVars } from './surface-vars'

describe('theme surface', () => {
  it('hands Midnight pages its ground when the Space chose Midnight', () => {
    expect(pageSurface({ megaTheme: { theme: 'midnight' } })).toBe(MIDNIGHT_SURFACE)
  })

  it('follows the website theme only while the Space page is synced to it', () => {
    expect(pageSurface({ siteStyle: { theme: 'midnight', synced: true } })).toBe(MIDNIGHT_SURFACE)
    expect(pageSurface({ siteStyle: { theme: 'midnight', synced: false } })).toBeNull()
  })

  it('email follows the theme without the sync switch', () => {
    expect(emailSurface({ siteStyle: { theme: 'midnight', synced: false } })).toBe(MIDNIGHT_SURFACE)
  })

  it('leaves themes that own no ground, and Spaces that never chose, on the app surfaces', () => {
    expect(pageSurface({ megaTheme: { theme: 'temple' } })).toBeNull()
    expect(pageSurface(null)).toBeNull()
    expect(emailSurface({})).toBeNull()
  })

  it('paints scoped tokens that read on the ground', () => {
    const vars = surfaceCssVars(MIDNIGHT_SURFACE)
    expect(vars['--color-canvas']).toBe(MIDNIGHT_SURFACE.canvas)
    expect(vars.colorScheme).toBe('dark')
    expect(contrastRatio(MIDNIGHT_SURFACE.text, MIDNIGHT_SURFACE.canvas)).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(MIDNIGHT_SURFACE.onSolid, MIDNIGHT_SURFACE.solid)).toBeGreaterThanOrEqual(4.5)
  })
})
