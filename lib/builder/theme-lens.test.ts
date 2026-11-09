import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { config } from '@/lib/page-editor/config'
import { applyKit } from '@/lib/sites/kits/apply'
import { KIT_INDEX, loadKit, NEW_WORLD_KIT_INDEX } from '@/lib/sites/kits/registry'
import { ROLES, ROLE_IDS } from '@/lib/blocks/roles/roles'
import { presentationDefault } from '@/components/sites/presentation'
import { EDITOR_THEME_OF } from '@/lib/sites/site-render-style'
import { SITE_THEMES, SITE_THEME_DEFS, type SiteStyle, type SiteThemeId } from '@/lib/theme/site-style'
import { WEBSITE_THEMES, type WebsiteSnapshot } from '@/lib/sites/editor/state'
import type { Data } from '@/lib/page-editor/types'
import { builderInit, builderReducer } from './state'
import { commitTheme, lensStyle, sectionLayouts, siteThemeOf, themeCards } from './theme-lens'

async function corpus(): Promise<WebsiteSnapshot[]> {
  const drafts: WebsiteSnapshot[] = []
  for (const { id, theme } of [...KIT_INDEX, ...NEW_WORLD_KIT_INDEX]) {
    const kit = await loadKit(id)
    if (!kit) continue
    const r = applyKit({ theme, pages: [] } as never, kit, 'replace', (type) => config.components[type]?.defaultProps)
    if (r.ok) drafts.push(r.snapshot)
  }
  return drafts
}

const live: SiteStyle = { theme: 'services', fonts: 'services', synced: true, spaceFonts: 'services', look: { corners: 'soft', spacing: null, header: null, footer: null }, dials: { register: 'day' } } as unknown as SiteStyle

describe('theme lens (BLD-303)', () => {
  it('maps every editor theme back to its site theme', () => {
    for (const id of Object.keys(EDITOR_THEME_OF) as SiteThemeId[]) expect(siteThemeOf(EDITOR_THEME_OF[id])).toBe(id)
    for (const theme of WEBSITE_THEMES) expect(EDITOR_THEME_OF[siteThemeOf(theme)]).toBe(theme)
  })

  it('wears the tried theme on hover with its own fonts and no stored style, and the draft\'s theme otherwise', () => {
    const draft = { theme: 'Services', look: { corners: 'sharp' } } as unknown as WebsiteSnapshot
    const trying = lensStyle(live, draft, 'new-world')
    expect(trying).toMatchObject({ theme: 'new-world', fonts: SITE_THEME_DEFS.find((t) => t.id === 'new-world')!.defaultFonts, look: { corners: null, spacing: null, header: null, footer: null } })
    expect(trying.dials).toBeUndefined()
    const own = lensStyle(live, draft, null)
    expect(own).toMatchObject({ theme: 'services', fonts: 'services', look: { corners: 'sharp' }, dials: { register: 'day' } })
    const other = lensStyle(live, { theme: 'Network' } as WebsiteSnapshot, null)
    expect(other.theme).toBe('network')
    expect(other.fonts).toBe(SITE_THEME_DEFS.find((t) => t.id === 'network')!.defaultFonts)
    // Pure: the live style is never written.
    expect(live.theme).toBe('services')
  })

  it('commits a theme as one undo step, and undo restores the draft exactly', () => {
    const doc = { root: { props: {} }, content: [{ type: ROLES.hero.type, props: { id: 'h', variant: 'split', variantSet: true } }, { type: ROLES.faq.type, props: { id: 'q' } }] } as Data
    let s = builderInit({ revision: 1, draft: { theme: 'Services', pages: [{ slug: 'home', label: 'Home', doc, comments: [] }] }, published: null, versions: [] } as never)
    const before = s.draft
    s = builderReducer(s, { type: 'edit', draft: commitTheme(s.draft, 'new-world') })
    expect(s.draft.theme).toBe('NewWorld')
    expect(s.past).toHaveLength(1)
    expect(s.draft.pages[0].doc.content).toEqual(doc.content)
    s = builderReducer(s, { type: 'undo' })
    expect(s.draft).toBe(before)
    // The same theme is not an edit.
    expect(commitTheme(before, 'services')).toBe(before)
  })

  it('pinned layouts never change on a switch; unpinned ones follow the new theme\'s default for the role', async () => {
    // The kit corpus carries no role blocks yet (the kits predate the roles), so the frozen set here is every role twice:
    // once following the theme, once pinned to its last layout. Every theme switch over it must hold both rules.
    const roles = ROLE_IDS
    const content = roles.flatMap((role) => [
      { type: ROLES[role].type, props: { id: `${role}-free` } },
      { type: ROLES[role].type, props: { id: `${role}-pin`, variant: Object.keys(ROLES[role].variants).at(-1)!, variantSet: true } },
    ])
    const kitPages = (await corpus()).flatMap((d) => d.pages)
    expect(kitPages.length).toBeGreaterThan(20)
    let checked = 0
    for (const from of SITE_THEMES) {
      const draft: WebsiteSnapshot = { theme: EDITOR_THEME_OF[from.id], pages: [{ slug: 'home', label: 'Home', doc: { root: { props: {} }, content } as Data, comments: [] }, ...kitPages] } as WebsiteSnapshot
      const was = sectionLayouts(draft.pages[0].doc, draft.theme)
      for (const to of SITE_THEMES) {
        const next = commitTheme(draft, to.id)
        const now = sectionLayouts(next.pages[0].doc, next.theme)
        expect(now.map((l) => l.id)).toEqual(was.map((l) => l.id))
        for (const [j, layout] of now.entries()) {
          checked++
          if (layout.pinned) expect(layout.variant).toBe(was[j].variant)
          else {
            const themed = presentationDefault(next.theme, layout.role)
            expect(layout.variant).toBe(themed && themed in ROLES[layout.role].variants ? themed : ROLES[layout.role].default)
          }
        }
        // Every block on every page keeps its props through the switch; only grid placements are reset.
        for (const [k, page] of draft.pages.entries()) expect(next.pages[k].doc.content.map((s) => s.props)).toEqual(page.doc.content.map((s) => s.props))
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })

  it('offers every picker theme as a card and marks the current one', () => {
    const cards = themeCards({ theme: 'NewWorld', pages: [] })
    expect(cards.map((c) => c.id)).toEqual(SITE_THEMES.map((t) => t.id))
    expect(cards.filter((c) => c.current).map((c) => c.id)).toEqual(['new-world'])
  })

  it('asks the server for nothing: the lens is pure and the document stays in memory', () => {
    const src = readFileSync('lib/builder/theme-lens.ts', 'utf8')
    expect(src).not.toMatch(/fetch\(|@\/lib\/sites\/editor\/actions|@\/lib\/supabase|'use client'|from 'react'/)
  })
})
