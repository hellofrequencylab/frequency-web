import { describe, it, expect } from 'vitest'
import { MEGA_THEMES } from '@/lib/theme/mega-theme'
import { loadKit } from '@/lib/sites/kits/registry'
import { applyKit } from '@/lib/sites/kits/apply'
import { nextWebsiteState, validWebsiteSnapshot, WEBSITE_THEMES_LIVE } from '@/lib/sites/editor/state'
import { generalKitId } from './starter-site'

describe('the starter website (LIVE-1533)', () => {
  it('names a General kit for every Mega Theme, and each one loads', async () => {
    for (const { id } of MEGA_THEMES.filter((t) => t.id !== 'network-kit')) { // its kits arrive with the kit registry pass
      const kit = await loadKit(generalKitId(id))
      expect(kit, id).not.toBeNull()
      expect(kit!.niche).toBe('general')
    }
  })

  it('each kit becomes a publishable website that wears its own theme', async () => {
    const { config } = await import('@/lib/page-editor/config')
    for (const { id, editor } of MEGA_THEMES.filter((t) => t.id !== 'network-kit')) {
      const kit = (await loadKit(generalKitId(id)))!
      expect(kit.theme, id).toBe(editor)
      const applied = applyKit({ theme: kit.theme, pages: [] }, kit, 'replace', (type) => config.components[type]?.defaultProps)
      if (!applied.ok) throw new Error(applied.error)
      const state = nextWebsiteState({ v: 1, revision: 0, draft: applied.snapshot, published: null, versions: [] }, applied.snapshot, true, 'Frequency')
      expect(state.revision).toBe(1)
      expect(state.published && validWebsiteSnapshot(state.published), id).toBe(true)
      expect(state.published!.pages.map((p) => p.slug)).toContain('home')
      if (kit.theme !== 'DAWN') expect(WEBSITE_THEMES_LIVE.has(kit.theme), id).toBe(true)
    }
  })
})
