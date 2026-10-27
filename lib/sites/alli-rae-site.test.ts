import { describe, expect, it } from 'vitest'
import { publishedWebsiteSnapshot, readWebsiteEditor, validWebsiteSnapshot, RESERVED_WEBSITE_SLUGS } from '@/lib/sites/editor/state'
import { ALLI_RAE_FOOTER, ALLI_RAE_MENU, alliRaeEditorState } from './alli-rae-site'
import { readSiteFooter } from './site-footer'
import { readSiteMenu } from '@/lib/spaces/site-menu'
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
    const f = readSiteFooter({ siteFooter: ALLI_RAE_FOOTER })
    expect(f?.columns).toHaveLength(3)
    expect(f?.columns[0].lines).toHaveLength(3)
    expect(f?.columns[0].links.map((l) => l.href)).toEqual(['mailto:alli@alliraebuilddesign.com', 'tel:7607076401'])
    expect(f?.copyright).toBe('© Alli Rae Build + Design Inc.')
    expect(f?.band?.ctas.map((c) => c.href)).toEqual(['/spaces/alliraebuilddesign/ready-to-build', '/spaces/alliraebuilddesign/book-a-consultation'])
    expect(f?.subscribe?.success).toBe('Thank you we look forward to cultivating inspiration for you!')
    expect(f?.utility?.items.length).toBe(3)
    expect(f?.logo).toMatch(/^\//)
  })
  it('saves a header menu with two dropdowns and keeps project pages out of the top bar', () => {
    const m = readSiteMenu({ siteMenu: ALLI_RAE_MENU })
    expect(m?.items.map((i) => i.label)).toEqual(['Contact', 'Portfolio', 'About'])
    expect(m?.items[0].children).toHaveLength(2)
    expect(m?.items[1].children).toHaveLength(3)
    expect(m?.known).toContain('page:book-a-consultation')
  })
})
