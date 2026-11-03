import { describe, expect, it } from 'vitest'
import { SITE_THEME_DEFS, readSiteStyle } from './site-style'

// GUARD (2026-11-03, the Vanta site): a change to the default theme, or the arrival of a new theme, must never restyle a
// site that already saved a theme. Every theme id a Space can have stored reads back as itself, and a Space with no saved
// siteStyle keeps reading as the Frequency house look until the owner picks another. If DEFAULT_SITE_THEME ever moves, this
// fails, so the move has to come with a backfill that writes siteStyle onto every existing Space first.
describe('existing sites keep their theme', () => {
  it('every stored theme id reads back as itself, whatever the default is', () => {
    for (const t of SITE_THEME_DEFS) expect(readSiteStyle({ siteStyle: { theme: t.id } }).theme).toBe(t.id)
  })
  it('a Space that never saved a theme keeps the Frequency house look', () => {
    expect(readSiteStyle({}).theme).toBe('frequency')
    expect(readSiteStyle(null).theme).toBe('frequency')
    expect(readSiteStyle({ websitePublished: true }).theme).toBe('frequency')
  })
  it('the men\'s work fonts still imply Menswork when no theme is saved', () => {
    expect(readSiteStyle({ theme: 'menswork' }).theme).toBe('bold')
  })
})
