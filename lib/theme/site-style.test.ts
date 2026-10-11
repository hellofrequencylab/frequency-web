import { describe, expect, it } from 'vitest'
import { readSiteStyle, siteTheme, spacePageFonts, withSiteStyle, SITE_THEMES } from './site-style'

// ADR-1726: the themes are Frequency (the house look) and Bold (until now Menswork). Every stored value
// from before the rename must keep rendering the way it did.
describe('the site style', () => {
  it('reads every legacy font set as the theme it used to mean', () => {
    expect(readSiteStyle(null)).toEqual({ theme: 'frequency', fonts: 'frequency', synced: true, spaceFonts: 'frequency' })
    // danieltyack: the house look in Classic fonts.
    expect(readSiteStyle({ theme: 'classic' })).toMatchObject({ theme: 'frequency', fonts: 'classic' })
    // heart-on-fire: Menswork is the Bold theme in its own fonts.
    expect(readSiteStyle({ theme: 'menswork' })).toMatchObject({ theme: 'bold', fonts: 'menswork' })
    // The retired Anton set reads as Frequency.
    expect(readSiteStyle({ theme: 'bold' })).toMatchObject({ theme: 'frequency', fonts: 'frequency' })
  })

  it('lets the theme and the fonts vary independently once saved', () => {
    const prefs = withSiteStyle({ theme: 'menswork' }, { theme: 'frequency' })
    expect(siteTheme(prefs)).toBe('frequency')
    expect(readSiteStyle(prefs).fonts).toBe('menswork')
  })

  it('keeps the Space page on the website style until syncing is turned off', () => {
    const synced = withSiteStyle({}, { fonts: 'editorial' })
    expect(spacePageFonts(synced)).toBe('editorial')
    const own = withSiteStyle(synced, { synced: false, spaceFonts: 'playful' })
    expect(spacePageFonts(own)).toBe('playful')
    expect(readSiteStyle(own).fonts).toBe('editorial')
    expect(spacePageFonts(withSiteStyle(own, { synced: true }))).toBe('editorial')
  })

  it('writes sparsely and keeps every other key', () => {
    const prefs = withSiteStyle({ theme: 'classic', profileLayout: { rows: [] } }, { fonts: 'frequency' })
    expect(prefs.theme).toBeUndefined()
    expect(prefs.profileLayout).toEqual({ rows: [] })
    expect(prefs.siteStyle).toEqual({ theme: 'frequency', synced: true, spaceFonts: 'classic' })
  })

  it('names the two themes Frequency and Bold, each with its own default fonts', () => {
    expect(SITE_THEMES.map((t) => [t.id, t.label, t.defaultFonts])).toEqual([
      ['frequency', 'Frequency', 'frequency'],
      ['bold', 'Bold', 'menswork'],
    ])
  })
})
