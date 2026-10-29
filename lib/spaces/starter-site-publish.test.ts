// The Wizard's publish, run headlessly (LIVE-1534, SYS-8): a new Space that picked a Theme Kit ends with a
// published website that has the join page and wears the same theme the Space was dressed in.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MEGA_THEMES } from '@/lib/theme/mega-theme'
import { publishedWebsiteSnapshot, readWebsiteEditor } from '@/lib/sites/editor/state'
import { planMegaTheme } from '@/lib/theme/apply-mega-theme'

const saved: unknown[] = []
vi.mock('@/lib/spaces/store', () => ({
  getSpaceById: async () => ({ id: 'space-1', slug: 'starter' }),
  saveStarterWebsiteState: async (_id: string, state: unknown) => { saved.push(state); return true },
}))
vi.mock('@/lib/sites/site-cache', () => ({ refreshSite: () => undefined }))
const attached: string[] = []
vi.mock('@/lib/sites/vercel-domains', () => ({
  addSiteSubdomain: async (host: string) => { attached.push(host); return { ok: true } },
}))

import { publishStarterSite } from './starter-site'

describe('the Wizard publish, headless', () => {
  beforeEach(() => { saved.length = 0; attached.length = 0 })

  it('publishes a website with a home and a join page, on the theme the Space was dressed in, for every Theme Kit', async () => {
    // The Network and Temple Theme Kits are not in WEBSITE_THEMES_LIVE until the owner turns them on, so the public gate keeps the house look.
    for (const { id, editor } of MEGA_THEMES.filter((t) => t.id !== 'network-kit' && t.id !== 'temple-kit')) {
      saved.length = 0
      expect(await publishStarterSite('space-1', id), id).toBe(true)
      // The public gate (publishedWebsiteSnapshot) reads the site style the apply wrote, so serve it as the Space would.
      const prefs = { ...planMegaTheme({}, id), websiteEditor: saved[0] }
      expect(readWebsiteEditor(prefs), id).not.toBeNull()
      const site = publishedWebsiteSnapshot(prefs)!
      const slugs = site.pages.map((p) => p.slug)
      expect(slugs, id).toContain('home')
      expect(slugs, id).toContain('join')
      expect(site.theme, id).toBe(editor)
    }
  })

  it('asks for the free address of the new site once it has landed (VLS-04)', async () => {
    expect(await publishStarterSite('space-1', 'midnight')).toBe(true)
    expect(attached).toEqual(['starter.frequencylocal.com'])
  })

  it('does nothing for a theme it does not know', async () => {
    expect(await publishStarterSite('space-1', 'not-a-theme')).toBe(false)
    expect(saved).toHaveLength(0)
    expect(attached).toHaveLength(0)
  })
})
