import { describe, it, expect } from 'vitest'
import { MEGA_NICHES, MEGA_THEMES, cleanSourceUrl, isMegaNicheId, isMegaThemeId, readMegaTheme, withMegaTheme } from './mega-theme'
import { isSiteThemeId } from './site-style'
import { EDITOR_THEME_OF } from '@/lib/sites/site-render-style'
import { WEBSITE_THEMES } from '@/lib/sites/editor/state'
import { KIT_INDEX } from '@/lib/sites/kits/registry'

describe('one theme id model (ADR-1881)', () => {
  it('maps every site theme to the editor theme the older tables name', () => {
    for (const t of MEGA_THEMES) if (t.site) expect(EDITOR_THEME_OF[t.site]).toBe(t.editor)
  })

  it('covers every site theme and every editor theme', () => {
    expect(MEGA_THEMES.flatMap((t) => (t.site ? [t.site] : [])).sort()).toEqual(Object.keys(EDITOR_THEME_OF).sort())
    expect(MEGA_THEMES.map((t) => t.editor).sort()).toEqual([...WEBSITE_THEMES].sort())
    for (const t of MEGA_THEMES) if (t.site) expect(isSiteThemeId(t.site)).toBe(true)
  })

  it('names the niches the site kits use', () => {
    for (const k of KIT_INDEX) expect(isMegaNicheId(k.niche)).toBe(true)
    expect(MEGA_NICHES).toHaveLength(6)
  })
})

describe('the stored choice', () => {
  it('reads unset for anything missing or malformed', () => {
    const unset = { theme: null, niche: null, action: null, sourceUrl: null, version: null }
    for (const p of [undefined, null, {}, 'x', { megaTheme: 'x' }, { megaTheme: { theme: 'nope', niche: 3, action: 'x', sourceUrl: 'http://a.com', version: -1 } }]) {
      expect(readMegaTheme(p)).toEqual(unset)
    }
  })

  it('round-trips and keeps every other preferences key', () => {
    const prefs = { theme: 'menswork', siteStyle: { theme: 'bold' }, hero: { tagline: 'Hi' } }
    const next = withMegaTheme(prefs, { theme: 'midnight', niche: 'studios', version: 2 })
    expect(next).toEqual({ ...prefs, megaTheme: { theme: 'midnight', niche: 'studios', version: 2 } })
    expect(readMegaTheme(next)).toEqual({ theme: 'midnight', niche: 'studios', action: null, sourceUrl: null, version: 2 })
    expect(prefs).not.toHaveProperty('megaTheme')
  })

  it('changes one part at a time, ignores unknown values and drops an empty node', () => {
    const a = withMegaTheme({}, { niche: 'coaches' })
    expect(a).toEqual({ megaTheme: { niche: 'coaches' } })
    expect(withMegaTheme(a, { theme: 'bogus', niche: 'bogus', version: 0 })).toEqual(a)
    expect(withMegaTheme(a, { theme: 'temple' })).toEqual({ megaTheme: { theme: 'temple', niche: 'coaches' } })
    expect(withMegaTheme(a, { niche: null })).toEqual({})
    expect(isMegaThemeId('wildheart')).toBe(true)
  })
})

describe('the picker answers', () => {
  it('stores the action and an https source site, and ignores anything else', () => {
    const a = withMegaTheme({}, { niche: 'venues', action: 'tour', sourceUrl: 'river-yoga.com' })
    expect(a).toEqual({ megaTheme: { niche: 'venues', action: 'tour', sourceUrl: 'https://river-yoga.com/' } })
    expect(withMegaTheme(a, { action: 'nope', sourceUrl: 'javascript:alert(1)' })).toEqual(a)
    expect(withMegaTheme(a, { action: null, sourceUrl: null })).toEqual({ megaTheme: { niche: 'venues' } })
  })
  it('cleans a source url', () => {
    expect(cleanSourceUrl('  https://a.example/x?y=1 ')).toBe('https://a.example/x?y=1')
    for (const bad of ['', 'http://a.example', 'https://u:p@a.example', 'localhost', 'ftp://a.example', 7, null, 'x'.repeat(400)]) {
      expect(cleanSourceUrl(bad)).toBeNull()
    }
  })
})
