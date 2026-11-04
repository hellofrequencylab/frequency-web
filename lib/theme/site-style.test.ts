import { describe, expect, it } from 'vitest'
import { readSitePageStyle, readSiteStyle, siteDials, siteLook, siteLookOverrides, siteTheme, spacePageDefaultAccent, spacePageFonts, spacePageSiteFaces, withSitePageTheme, withSiteStyle, SITE_THEMES, SITE_THEME_DEFS, THEME_LOOK } from './site-style'
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

  it('offers the nine themes New World, Designer, Bold, Wildheart, Network, Temple, Nocturne, Services and CyberWitch, New World first and Designer second (owner 2026-11-04, Pin 9; Services and CyberWitch offered 2026-11-04; the Temple Theme Kit is the Temple), each with its own default fonts; Default is no longer offered (owner 2026-11-03)', () => {
    expect(SITE_THEMES.map((t) => [t.id, t.label, t.defaultFonts])).toEqual([
      ['new-world', 'New World', 'modern'],
      ['designer', 'Designer', 'classic'],
      ['bold', 'Bold', 'menswork'],
      ['wildheart', 'Wildheart', 'classic'],
      ['network-kit', 'Network', 'modern'],
      ['temple-kit', 'Temple', 'classic'],
      ['midnight', 'Nocturne', 'classic'],
      ['services', 'Services', 'modern'],
      ['cyberwitch', 'CyberWitch', 'classic'],
    ])
    // The earlier network theme is worn by live sites but offered nowhere; it still resolves and renders.
    expect(SITE_THEMES.some((t) => t.id === 'network')).toBe(false)
    expect(SITE_THEME_DEFS.find((t) => t.id === 'network')).toMatchObject({ label: 'Network', defaultFonts: 'modern' })
    // So is the earlier temple theme (Royal Temple's): offered nowhere, still resolved and rendered.
    expect(SITE_THEMES.some((t) => t.id === 'temple')).toBe(false)
    expect(SITE_THEME_DEFS.find((t) => t.id === 'temple')).toMatchObject({ label: 'Temple', defaultFonts: 'classic' })
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
    expect(readSiteStyle({ siteStyle: { theme: 'frequency', pages: { 'Bad Slug': 'bold', about: 'sunrise', ok: 'bold' } } }).pages).toEqual({ ok: 'bold' })
    expect(readSiteStyle({ siteStyle: { theme: 'frequency', pages: 'bold' } }).pages).toEqual({})
    // An invalid slug writes nothing.
    expect(readSiteStyle(withSitePageTheme({}, 'Not A Slug', 'bold')).pages).toEqual({})
  })
})

describe('the website faces on the Space page', () => {
  it('a Space on the Midnight Mega Theme wears the Midnight faces whatever the sync switch says', () => {
    expect(spacePageSiteFaces({ megaTheme: { theme: 'midnight' } })).toBe('midnight')
    expect(spacePageSiteFaces({ megaTheme: { theme: 'midnight' }, siteStyle: { theme: 'frequency', synced: false } })).toBe('midnight')
  })

  it('follows a synced Midnight website, and only while synced', () => {
    expect(spacePageSiteFaces({ siteStyle: { theme: 'midnight', synced: true } })).toBe('midnight')
    expect(spacePageSiteFaces({ siteStyle: { theme: 'midnight', synced: false } })).toBeNull()
  })

  it('follows a synced Designer website, and only while synced', () => {
    expect(spacePageSiteFaces({ siteStyle: { theme: 'designer', synced: true } })).toBe('designer')
    expect(spacePageSiteFaces({ siteStyle: { theme: 'designer', synced: false } })).toBeNull()
  })

  it('follows a synced Temple Theme Kit website, and only while synced', () => {
    expect(spacePageSiteFaces({ siteStyle: { theme: 'temple-kit', synced: true } })).toBe('temple-kit')
    expect(spacePageSiteFaces({ siteStyle: { theme: 'temple-kit', synced: false } })).toBeNull()
    expect(spacePageSiteFaces({ siteStyle: { theme: 'free-human', synced: true } })).toBe('free-human')
    expect(spacePageSiteFaces({ siteStyle: { theme: 'free-human', synced: false } })).toBeNull()
    // The earlier Royal Temple theme keeps its Classic page.
    expect(spacePageSiteFaces({ siteStyle: { theme: 'temple', synced: true } })).toBeNull()
  })

  it('leaves a Space with no theme of its own on the font set it picked', () => {
    expect(spacePageSiteFaces({})).toBeNull()
  })
})

// LIVE-1997: the theme editor's dials sit beside the four styles and are stored the same sparse way.
describe('the theme editor dials', () => {
  it('reads back a site that never set one exactly as before', () => {
    expect(readSiteStyle({ siteStyle: { theme: 'designer', corners: 'square' } }).dials).toBeUndefined()
    expect('dials' in readSiteStyle(null)).toBe(false)
    expect(siteDials(readSiteStyle(null))).toEqual({ register: 'day', type: 'caps', motion: 'full', hero: 'glow', image: 'glow', accent: null })
    expect(siteDials(readSiteStyle({ siteStyle: { theme: 'midnight' } }))).toMatchObject({ register: 'night' })
  })
  it('writes only the dials that were set and round-trips them', () => {
    const prefs = withSiteStyle({}, { dials: { register: 'night', accent: '#1aa7c0' } })
    expect(prefs.siteStyle).toEqual({ theme: 'frequency', synced: true, spaceFonts: 'frequency', register: 'night', accent: '#1aa7c0' })
    expect(readSiteStyle(prefs).dials).toEqual({ register: 'night', accent: '#1aa7c0' })
    expect(siteDials(readSiteStyle(prefs))).toMatchObject({ register: 'night', type: 'caps', accent: '#1aa7c0' })
  })
  it('lets a theme\'s declared default beat the fallback, and an owner choice beat both', () => {
    expect(siteDials(readSiteStyle(null), { type: 'quiet' }).type).toBe('quiet')
    expect(siteDials(readSiteStyle({ siteStyle: { type: 'editorial' } }), { type: 'quiet' }).type).toBe('editorial')
  })
  it('ignores an unknown stored value and clears when asked', () => {
    expect(readSiteStyle({ siteStyle: { register: 'dusk', motion: 'off', accent: 'Not An Accent' } }).dials).toEqual({ motion: 'off' })
    expect(readSiteStyle(withSiteStyle({ siteStyle: { motion: 'off' } }, { dials: undefined })).dials).toBeUndefined()
  })
  it('keeps the dials when a page wears its own theme', () => {
    const prefs = withSiteStyle({}, { dials: { type: 'quiet' } })
    expect(readSitePageStyle(prefs, 'x').dials).toEqual({ type: 'quiet' })
  })
})
