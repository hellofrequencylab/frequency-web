import { describe, expect, it } from 'vitest'
import { MEGA_THEMES } from '@/lib/theme/mega-theme'
import { publishedWebsiteSnapshot, WEBSITE_THEMES_LIVE } from './state'

// A Space whose siteStyle.theme and published website document name different themes silently falls back to the
// house look (danieltyack.com, 2026-11-03). Every theme the picker offers must pair with the document theme the
// renderer accepts for it, so a new theme cannot be added to one table and not the other.
const page = { slug: 'home', label: 'Home', seo: { title: '', description: '' }, comments: [], doc: { root: {}, content: [] } }

describe('the picker theme and its website document theme agree', () => {
  for (const m of MEGA_THEMES) {
    it(`${m.id} serves a ${m.editor} document`, () => {
      const prefs = { siteStyle: { theme: m.site }, megaTheme: { theme: m.id, niche: 'general', version: 1 }, websiteEditor: { published: { theme: m.editor, pages: [page] } } }
      if (m.editor === 'DAWN') return // DAWN is served only for an explicit Default choice, covered in state.test.ts
      expect(WEBSITE_THEMES_LIVE.has(m.editor)).toBe(true)
      expect(publishedWebsiteSnapshot(prefs)?.theme).toBe(m.editor)
    })
    it(`${m.id} ignores a document in another theme`, () => {
      const other = MEGA_THEMES.find((x) => x.editor !== m.editor && x.editor !== 'DAWN')!
      const prefs = { siteStyle: { theme: m.site }, websiteEditor: { published: { theme: other.editor, pages: [page] } } }
      expect(publishedWebsiteSnapshot(prefs)).toBeNull()
    })
  }
})
