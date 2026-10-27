import { describe, expect, it } from 'vitest'
import { publishedWebsiteSnapshot, readWebsiteEditor, validWebsiteSnapshot, RESERVED_WEBSITE_SLUGS } from '@/lib/sites/editor/state'
import { HOF_FOOTER, HOF_MENU, houseOfFatesEditorState } from './house-of-fates-site'
import { readSiteFooter } from './site-footer'
import { readSiteMenu } from '@/lib/spaces/site-menu'
import { config } from '@/lib/page-editor/config'

const state = houseOfFatesEditorState('2026-10-27T00:00:00.000Z')

describe('the House of Fates site', () => {
  it('is a saved variant of Nocturne beside the shared Nocturne draft, and the variant is live', () => {
    expect(state.draft.themes?.map((t) => [t.id, t.theme])).toEqual([['nocturne', 'Midnight'], ['house-of-fates', 'Midnight']])
    expect(state.draft.activeTheme).toBe('house-of-fates')
    expect(state.published?.liveTheme).toBe('house-of-fates')
    // The public snapshot carries no draft list, and the look it serves is the one this Space always wore.
    expect(state.published).not.toHaveProperty('themes')
    expect(state.published?.brand).toEqual(state.draft.brand)
    expect(state.published?.theme).toBe('Midnight')
  })
  it('stays out of the theme library and the kit registry', async () => {
    const [{ THEME_LIBRARY }, { KIT_INDEX, PROFILE_KIT_INDEX }] = await Promise.all([import('@/lib/themes/library'), import('@/lib/sites/kits/registry')])
    const listed = JSON.stringify([THEME_LIBRARY, KIT_INDEX, PROFILE_KIT_INDEX]).toLowerCase()
    expect(listed).not.toContain('house of fates')
    expect(listed).not.toContain('house-of-fates')
  })
  it('is a valid published Midnight website with a Home', () => {
    expect(validWebsiteSnapshot(state.draft)).toBe(true)
    expect(readWebsiteEditor({ websiteEditor: state })).not.toBeNull()
    expect(state.draft.pages.map((p) => p.slug)).toEqual(['home', 'services', 'hypnotic-sound', 'group-programs', 'shop', 'newsletter', 'about', 'contact-us'])
  })
  it('serves on the Midnight theme and uses no reserved page slug', () => {
    const prefs = { websiteEditor: state, siteStyle: { theme: 'midnight' } }
    expect(publishedWebsiteSnapshot(prefs)?.theme).toBe('Midnight')
    for (const p of state.draft.pages) expect(RESERVED_WEBSITE_SLUGS.has(p.slug), p.slug).toBe(false)
  })
  it('draws only registered blocks and every page link resolves', () => {
    const slugs = new Set(state.draft.pages.map((p) => p.slug))
    for (const p of state.draft.pages) for (const b of p.doc.content) expect(Object.keys(config.components), `${p.slug} ${b.type}`).toContain(b.type)
    for (const [, slug] of JSON.stringify(state.draft).matchAll(/"~\/([a-z-]+)"/g)) expect(slugs.has(slug), `~/${slug}`).toBe(true)
  })
  it('keeps brand copy free of em dashes', () => {
    expect(JSON.stringify(state.draft)).not.toMatch(/—/)
    expect(JSON.stringify(HOF_FOOTER)).not.toMatch(/—/)
  })
  it('keeps the footer readable by the footer reader', () => {
    const f = readSiteFooter({ siteFooter: HOF_FOOTER })
    expect(f?.columns).toHaveLength(3)
    expect(f?.subscribe?.button).toBe('Subscribe')
    expect(f?.utility?.items.length).toBe(4)
  })
  it('saves a six link header menu', () => {
    const m = readSiteMenu({ siteMenu: HOF_MENU })
    expect(m?.items.map((i) => i.label)).toEqual(['Services', 'Book', 'Events', 'Group Programs', 'Hypnosis Library', 'Newsletter'])
    expect(m?.known).toContain('page:contact-us')
  })
})
