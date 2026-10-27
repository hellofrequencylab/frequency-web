import { describe, expect, it } from 'vitest'
import { publishedWebsiteSnapshot, readWebsiteEditor, validWebsiteSnapshot, RESERVED_WEBSITE_SLUGS } from '@/lib/sites/editor/state'
import { ALLI_RAE_FOOTER, alliRaeEditorState } from './alli-rae-site'
import { readSiteFooter } from './site-footer'
import { designerComponents } from '@/components/page-editor/blocks/designer'

const state = alliRaeEditorState('2026-10-27T00:00:00.000Z')

describe('the Alli Rae site', () => {
  it('is a valid published Designer website with a Home', () => {
    expect(validWebsiteSnapshot(state.draft)).toBe(true)
    expect(readWebsiteEditor({ websiteEditor: state })).not.toBeNull()
    expect(state.draft.pages.map((p) => p.slug)).toEqual(['home', 'portfolio', 'about', 'spanish-modern-custom-home', 'mid-century-modern-bathroom-remodel', 'breezy-island-kitchen-remodel', 'ready-to-build', 'book-a-consultation'])
  })
  it('serves on the Designer theme and uses no reserved page slug', () => {
    const prefs = { websiteEditor: { ...state, published: state.published }, siteStyle: { theme: 'designer' } }
    expect(publishedWebsiteSnapshot(prefs)?.theme).toBe('Designer')
    for (const p of state.draft.pages) expect(RESERVED_WEBSITE_SLUGS.has(p.slug), p.slug).toBe(false)
  })
  it('draws only registered Designer blocks and every page link resolves', () => {
    const slugs = new Set(state.draft.pages.map((p) => p.slug))
    for (const p of state.draft.pages) {
      for (const b of p.doc.content) expect(Object.keys(designerComponents), `${p.slug} ${b.type}`).toContain(b.type)
    }
    for (const [, slug] of JSON.stringify(state.draft).matchAll(/"~\/([a-z-]+)"/g)) expect(slugs.has(slug), `~/${slug}`).toBe(true)
  })
  it('keeps the footer readable by the footer reader', () => {
    expect(readSiteFooter({ siteFooter: ALLI_RAE_FOOTER })?.columns).toHaveLength(2)
  })
})
