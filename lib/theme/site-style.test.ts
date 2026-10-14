import { describe, expect, it } from 'vitest'
import { readSitePageStyle, readSiteStyle, siteLook, siteLookOverrides, siteTheme, spacePageDefaultAccent, spacePageFonts, withSitePageTheme, withSiteStyle, SITE_THEMES, THEME_LOOK } from './site-style'
import { MENSWORK_PALETTE } from './menswork'
import { WILDHEART_PALETTE } from './wildheart'

// ADR-1726: the themes are Frequency (the house look) and Bold (until now Menswork). Every stored value
// from before the rename must keep rendering the way it did.
describe('the site style', () => {
  it('reads every legacy font set as the theme it used to mean', () => {
    expect(readSiteStyle(null)).toEqual({ theme: 'frequency', fonts: 'frequency', synced: true, spaceFonts: 'frequency', look: { corners: null, spacing: null, header: null, footer: null }, pages: {} })
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

  it('names the four themes Default, Bold, Wildheart and Network, each with its own default fonts', () => {
    expect(SITE_THEMES.map((t) => [t.id, t.label, t.defaultFonts])).toEqual([
      ['frequency', 'Default', 'frequency'],
      ['bold', 'Bold', 'menswork'],
      ['wildheart', 'Wildheart', 'classic'],
      ['network', 'Network', 'modern'],
    ])
    // A stock theme: no stored value from before it existed reads as Wildheart.
    expect(readSiteStyle({ theme: 'classic' }).theme).toBe('frequency')
    expect(readSiteStyle({ siteStyle: { theme: 'wildheart' } })).toMatchObject({ theme: 'wildheart', fonts: 'frequency' })
    expect(siteLook(readSiteStyle({ siteStyle: { theme: 'wildheart' } }))).toEqual(THEME_LOOK.wildheart)
    expect(THEME_LOOK.wildheart).toEqual({ corners: 'soft', spacing: 'airy', header: 'bar', footer: 'full' })
  })

  // ADR-1728: corners, spacing, header and footer over the theme.
  it('gives each theme its own look until the owner changes one', () => {
    expect(siteLook(readSiteStyle(null))).toEqual(THEME_LOOK.frequency)
    expect(siteLook(readSiteStyle({ theme: 'menswork' }))).toEqual(THEME_LOOK.bold)
    // Today's two sites: the house pill with a minimal footer, the Bold bar with a full one.
    expect(THEME_LOOK.frequency).toEqual({ corners: 'soft', spacing: 'airy', header: 'pill', footer: 'minimal' })
    expect(THEME_LOOK.bold).toEqual({ corners: 'square', spacing: 'balanced', header: 'bar', footer: 'full' })
    // Nothing to restyle on a site that kept its theme's look, so it renders exactly as before.
    expect(siteLookOverrides(readSiteStyle({ theme: 'classic' }))).toEqual({})
    expect(siteLookOverrides(readSiteStyle({ theme: 'menswork' }))).toEqual({})
  })

  it('keeps an explicit choice across a theme switch and lets the rest follow the new theme', () => {
    const prefs = withSiteStyle({}, { look: { corners: 'square', spacing: null, header: null, footer: null } })
    expect(prefs.siteStyle).toEqual({ theme: 'frequency', synced: true, spaceFonts: 'frequency', corners: 'square' })
    expect(siteLookOverrides(readSiteStyle(prefs))).toEqual({ corners: 'square' })
    const bold = withSiteStyle(prefs, { theme: 'bold' })
    expect(siteLook(readSiteStyle(bold))).toEqual({ ...THEME_LOOK.bold, corners: 'square' })
    // Square is Bold's own, so a Bold site has nothing left to restyle.
    expect(siteLookOverrides(readSiteStyle(bold))).toEqual({})
  })

  it('ignores an unknown stored value', () => {
    expect(readSiteStyle({ siteStyle: { corners: 'wobbly', header: 'bar' } }).look).toEqual({ corners: null, spacing: null, header: 'bar', footer: null })
  })

  it("gives a synced Space page on a Bold site Bold's teal when the owner picked no accent", () => {
    expect(spacePageDefaultAccent({ theme: 'menswork' }, '--color-primary')).toBe(MENSWORK_PALETTE.teal)
    expect(spacePageDefaultAccent({ theme: 'menswork', siteStyle: { theme: 'bold', synced: false } }, '--color-primary')).toBe('--color-primary')
    expect(spacePageDefaultAccent({ theme: 'classic' }, '--color-primary')).toBe('--color-primary')
    expect(spacePageDefaultAccent({ siteStyle: { theme: 'wildheart' } }, '--color-primary')).toBe(WILDHEART_PALETTE.violet)
  })

  // LIVE-699: a theme per page, falling back to the site's.
  it('lets one page wear its own theme and falls back to the site theme everywhere else', () => {
    const site = withSiteStyle({}, { theme: 'frequency', look: { corners: 'square', spacing: null, header: null, footer: null } })
    expect(readSitePageStyle(site, 'events')).toEqual(readSiteStyle(site))
    const prefs = withSitePageTheme(site, 'events', 'bold')
    expect(readSiteStyle(prefs).pages).toEqual({ events: 'bold' })
    // The site, Home and every other page keep the site's theme.
    expect(siteTheme(prefs)).toBe('frequency')
    expect(readSitePageStyle(prefs, 'home').theme).toBe('frequency')
    // The events page wears Bold, in Bold's own fonts, keeping the owner's explicit corners and taking
    // Bold's own spacing, header and footer for the rest.
    const events = readSitePageStyle(prefs, 'events')
    expect(events).toMatchObject({ theme: 'bold', fonts: 'menswork' })
    expect(siteLook(events)).toEqual({ ...THEME_LOOK.bold, corners: 'square' })
    expect(siteLookOverrides(events)).toEqual({})
    // Clearing the override puts the page back on the site's theme and drops the stored entry.
    const cleared = withSitePageTheme(prefs, 'events', null)
    expect(readSitePageStyle(cleared, 'events').theme).toBe('frequency')
    expect((cleared.siteStyle as Record<string, unknown>).pages).toBeUndefined()
  })

  it('keeps page themes through every other style write and drops a malformed entry', () => {
    const prefs = withSitePageTheme({}, 'about', 'bold')
    expect(readSiteStyle(withSiteStyle(prefs, { theme: 'bold', fonts: 'menswork' })).pages).toEqual({ about: 'bold' })
    // A page whose theme equals the site's reads as the site style, unchanged.
    expect(readSitePageStyle(withSiteStyle(prefs, { theme: 'bold' }), 'about').fonts).toBe(readSiteStyle(withSiteStyle(prefs, { theme: 'bold' })).fonts)
    expect(readSiteStyle({ siteStyle: { theme: 'frequency', pages: { 'Bad Slug': 'bold', about: 'midnight', ok: 'bold' } } }).pages).toEqual({ ok: 'bold' })
    expect(readSiteStyle({ siteStyle: { theme: 'frequency', pages: 'bold' } }).pages).toEqual({})
    // An invalid slug writes nothing.
    expect(readSiteStyle(withSitePageTheme({}, 'Not A Slug', 'bold')).pages).toEqual({})
  })
})
