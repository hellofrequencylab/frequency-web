import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-SYS-7: one theme choice reaches the website, the email, the Spotlight and the Space page, and the
// Space page takes only a font set and an accent.
const mocks = vi.hoisted(() => ({
  row: null as { slug: string; brand_accent: string | null; preferences: unknown } | null,
  patches: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  merges: [] as { id: string; path: string[]; patch: Record<string, unknown> }[],
  refresh: vi.fn(),
}))
vi.mock('@/lib/spaces/store', () => ({
  getSpaceById: async () => (mocks.row ? { slug: mocks.row.slug, brandAccent: mocks.row.brand_accent, preferences: mocks.row.preferences } : null),
  patchSpacePreferences: async (_id: string, p: Record<string, unknown>) => { mocks.patches.push(p); return true },
  fillSpaceBrandAccent: async (_id: string, accent: string) => { mocks.updates.push({ brand_accent: accent }); return true },
}))
vi.mock('@/lib/sites/site-cache', () => ({ refreshSite: mocks.refresh }))
vi.mock('@/lib/profiles/meta', () => ({
  mergeProfileMetaPath: async (_c: unknown, id: string, path: string[], patch: Record<string, unknown>) => { mocks.merges.push({ id, path, patch }); return { meta: {}, error: null } },
}))
import { applyMegaTheme, megaThemeSurfaces, planMegaTheme } from './apply-mega-theme'
import { MEGA_THEMES, readMegaTheme } from './mega-theme'
import { memberSpaceFonts, readSiteStyle, siteTheme } from './site-style'
import { emailSurface } from './surface'

describe('megaThemeSurfaces', () => {
  it('answers for every Mega Theme, with the Space page limited to fonts and an accent', () => {
    for (const { id } of MEGA_THEMES) {
      const s = megaThemeSurfaces(id)
      expect(s.theme).toBe(id)
      expect(Object.keys(s.spacePage).sort()).toEqual(['accent', 'fonts'])
    }
  })

  it('reaches the Spotlight for every Mega Theme, and to email', () => {
    // The earlier network theme is no longer a Spotlight preset: it is offered nowhere.
    for (const { id } of MEGA_THEMES) expect(megaThemeSurfaces(id).spotlightPreset, id).toBe(id === 'network' ? null : id)
    const themed = MEGA_THEMES.filter(({ id }) => megaThemeSurfaces(id).email).map(({ id }) => id)
    expect(themed).toEqual(MEGA_THEMES.map(({ id }) => id))
  })
})

describe('planMegaTheme', () => {
  it('lands every surface on one theme id and keeps what the owner set', () => {
    const before = { theme: 'menswork', siteStyle: { theme: 'bold', synced: false, corners: 'square' }, megaTheme: { niche: 'coaches' }, hero: { heading: 'Hi' } }
    const next = planMegaTheme(before, 'temple')
    expect(readMegaTheme(next)).toMatchObject({ theme: 'temple', niche: 'coaches' })
    expect(siteTheme(next)).toBe('temple')
    expect(readSiteStyle(next)).toMatchObject({ synced: true, look: { corners: 'square' } })
    expect(memberSpaceFonts(next)).toBe(megaThemeSurfaces('temple').spacePage.fonts)
    expect(next.hero).toEqual({ heading: 'Hi' })
  })

  it('is idempotent', () => {
    const once = planMegaTheme({}, 'midnight')
    expect(planMegaTheme(once, 'midnight')).toEqual(once)
    expect(emailSurface(once)).not.toBeNull()
  })
})

describe('applyMegaTheme', () => {
  beforeEach(() => {
    mocks.row = { slug: 'hof', brand_accent: null, preferences: {} }
    mocks.patches = []
    mocks.updates = []
    mocks.merges = []
    mocks.refresh.mockReset()
  })

  it('refuses an unknown theme before touching anything', async () => {
    expect(await applyMegaTheme('s1', 'neon')).toMatchObject({ ok: false })
    expect(mocks.patches).toEqual([])
  })

  it('writes only the three keys it owns, fills a blank accent, and refreshes the site', async () => {
    const res = await applyMegaTheme('s1', 'designer')
    expect(res).toMatchObject({ ok: true, wrote: { accent: true, spotlight: false } })
    expect(Object.keys(mocks.patches[0]).sort()).toEqual(['megaTheme', 'siteStyle', 'theme'])
    expect(mocks.updates[0]).toEqual({ brand_accent: megaThemeSurfaces('designer').spacePage.accent })
    expect(mocks.refresh).toHaveBeenCalledWith('hof')
  })

  it('never replaces a brand color the owner picked', async () => {
    mocks.row = { slug: 'hof', brand_accent: '#112233', preferences: {} }
    await applyMegaTheme('s1', 'midnight')
    expect(mocks.updates).toEqual([])
  })

  it('dresses the Spotlight only when the owner names their profile and a preset exists', async () => {
    await applyMegaTheme('s1', 'midnight')
    expect(mocks.merges).toEqual([])
    await applyMegaTheme('s1', 'midnight', { spotlight: { profileId: 'p1', client: {} as never } })
    expect(mocks.merges).toHaveLength(1)
    expect(mocks.merges[0]).toMatchObject({ id: 'p1', path: ['spotlight'] })
    await applyMegaTheme('s1', 'bold', { spotlight: { profileId: 'p1', client: {} as never } })
    expect(mocks.merges).toHaveLength(2)
    expect(mocks.merges[1].patch.theme).toMatchObject({ accent: '#00a6c8' })
  })
})
