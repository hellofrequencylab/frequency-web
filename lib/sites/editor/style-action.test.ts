import { beforeEach, describe, expect, it, vi } from 'vitest'

// ADR-1728: the editor's Theme tab saves the site's global styles, the same setting Identity and branding
// edits. The editor autosaves its draft into the same preferences row, so the style write is KEY-SCOPED
// (SCAN-833, ADR-1822): it sends only `theme` and `siteStyle` through set_space_preferences and never
// rewrites the rest of the blob.
const mocks = vi.hoisted(() => ({ host: 'hearts.example', allowed: true, preferences: {} as unknown, patches: [] as Record<string, unknown>[], accents: [] as Record<string, unknown>[], results: [] as boolean[], refresh: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => ({ get: () => mocks.host }), cookies: async () => ({ get: () => ({ value: 'token' }) }) }))
vi.mock('@/lib/sites/hosted', () => ({ resolveHostedSpace: async () => ({ id: 'space', slug: 'hearts' }) }))
vi.mock('@/lib/sites/site-admin-pass', () => ({ SITE_ADMIN_COOKIE: 'admin', readSiteAdminPass: () => ({ staff: false, profileId: 'owner' }), passOpensSite: () => true }))
vi.mock('@/lib/sites/site-admin', () => ({ siteAdminAllowed: async () => mocks.allowed, readSiteAdminAuthor: async () => ({ name: 'Owner' }) }))
vi.mock('@/lib/sites/site-cache', () => ({ refreshSite: mocks.refresh }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slug: 'hearts', brand_accent: null, preferences: mocks.preferences, owner_profile_id: 'owner' }, error: null }) }) }),
      update: (v: Record<string, unknown>) => ({ eq: async () => { mocks.accents.push(v); return { error: null } } }),
    }),
    rpc: async (fn: string, args: { p_space_id: string; p_patch: Record<string, unknown> }) => {
      if (fn !== 'set_space_preferences') throw new Error(`unexpected rpc ${fn}`)
      mocks.patches.push(args.p_patch)
      const landed = mocks.results.shift() ?? true
      return { data: landed, error: null }
    },
  }),
}))
import { saveWebsiteStyle } from './actions'

describe('saving the global styles from the website editor', () => {
  beforeEach(() => {
    mocks.host = 'hearts.example'
    mocks.allowed = true
    mocks.preferences = { theme: 'classic', websiteEditor: { revision: 7 }, profileLayout: { rows: [] } }
    mocks.patches = []
    mocks.accents = []
    mocks.results = []
    mocks.refresh.mockReset()
  })

  it('writes only the two style keys it owns and never the rest of the blob', async () => {
    const result = await saveWebsiteStyle('hearts.example', { look: { corners: 'square', header: 'bar' } })
    expect(result).toMatchObject({ ok: true, style: { theme: 'frequency', look: { corners: 'square', header: 'bar' } } })
    expect(mocks.patches).toHaveLength(1)
    const [patch] = mocks.patches
    expect(Object.keys(patch).sort()).toEqual(['siteStyle', 'theme'])
    expect(patch.theme).toBe('classic')
    expect(patch.siteStyle).toMatchObject({ corners: 'square', header: 'bar' })
    expect('websiteEditor' in patch).toBe(false)
    expect('profileLayout' in patch).toBe(false)
    expect(mocks.refresh).toHaveBeenCalledWith('hearts')
  })

  it("switches the theme with that theme's fonts", async () => {
    const result = await saveWebsiteStyle('hearts.example', { theme: 'bold' })
    expect(result).toMatchObject({ ok: true, style: { theme: 'bold', fonts: 'menswork' } })
    expect(mocks.patches[0].theme).toBe('menswork')
    // One apply (LIVE-SYS-7): the choice record rides with the style, and a blank brand color takes the theme's accent.
    expect(mocks.patches[0].megaTheme).toMatchObject({ theme: 'bold' })
    expect(mocks.accents).toHaveLength(1)
  })

  it('deletes the fonts key (null) when the style goes back to the default fonts', async () => {
    mocks.preferences = { theme: 'menswork', siteStyle: { theme: 'bold' } }
    await saveWebsiteStyle('hearts.example', { theme: 'frequency' })
    expect(mocks.patches[0].theme).toBeNull()
  })

  it('reports a write that did not land instead of pretending', async () => {
    mocks.results = [false]
    expect(await saveWebsiteStyle('hearts.example', { look: { spacing: 'compact' } })).toMatchObject({ ok: false })
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('refuses an unknown value, a retired theme and a signed-out editor before writing', async () => {
    expect(await saveWebsiteStyle('hearts.example', { theme: 'Midnight' })).toMatchObject({ ok: false })
    expect(await saveWebsiteStyle('hearts.example', { look: { corners: 'wobbly' } })).toMatchObject({ ok: false })
    expect(await saveWebsiteStyle('hearts.example', { look: { border: 'thick' } })).toMatchObject({ ok: false })
    mocks.allowed = false
    expect(await saveWebsiteStyle('hearts.example', { look: { corners: 'square' } })).toMatchObject({ ok: false })
    expect(mocks.patches).toEqual([])
  })
})
