import { beforeEach, describe, expect, it, vi } from 'vitest'

// THEME DRAFTS: picking a theme changes the draft only. Publishing is when the live site wears it.
const mocks = vi.hoisted(() => ({ preferences: {} as unknown, rpc: vi.fn(), refresh: vi.fn(), apply: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => ({ get: () => 'hearts.example' }), cookies: async () => ({ get: () => ({ value: 'token' }) }) }))
vi.mock('@/lib/sites/hosted', () => ({ resolveHostedSpace: async () => ({ id: 'space', slug: 'hearts' }) }))
vi.mock('@/lib/sites/site-admin-pass', () => ({ SITE_ADMIN_COOKIE: 'admin', readSiteAdminPass: () => ({ staff: false, profileId: 'owner' }), passOpensSite: () => true }))
vi.mock('@/lib/sites/site-admin', () => ({ siteAdminAllowed: async () => true, readSiteAdminAuthor: async () => ({ name: 'Owner' }) }))
vi.mock('@/lib/sites/site-cache', () => ({ refreshSite: mocks.refresh }))
vi.mock('@/lib/theme/apply-mega-theme', async (original) => ({ ...(await original<typeof import('@/lib/theme/apply-mega-theme')>()), applyMegaTheme: mocks.apply }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === 'spaces' ? { preferences: mocks.preferences, owner_profile_id: 'owner' } : { website_editor: null }, error: null }) }) }) }),
  }),
}))
import { saveWebsiteDraft } from './actions'
import type { WebsiteSnapshot } from './state'
import { addThemeDraft } from './theme-drafts'

const home = { slug: 'home', label: 'Home', doc: { root: {}, content: [] }, seo: { title: '', description: '' }, comments: [] }
const nocturne: WebsiteSnapshot = { theme: 'Midnight', pages: [home] }
const designer = (() => { const r = addThemeDraft(nocturne, 'Designer', 'Light try'); if (!r.ok) throw new Error(r.error); return r.snapshot })()
const rpcNames = () => mocks.rpc.mock.calls.map((c) => c[0])

describe('publishing a theme draft', () => {
  beforeEach(() => {
    mocks.preferences = { siteStyle: { theme: 'midnight' }, theme: 'classic' }
    mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null })
    mocks.refresh.mockReset()
    mocks.apply.mockReset().mockResolvedValue({ ok: true })
  })

  it('saving a draft of another theme, without publishing, never touches the live style', async () => {
    expect(await saveWebsiteDraft('hearts.example', 0, designer)).toMatchObject({ ok: true })
    expect(rpcNames()).toEqual(['save_website_editor'])
    expect(mocks.apply).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('publishing it switches the live site through the one apply, then refreshes the site', async () => {
    expect(await saveWebsiteDraft('hearts.example', 0, designer, true)).toMatchObject({ ok: true })
    expect(mocks.apply).toHaveBeenCalledExactlyOnceWith('space', 'designer')
    expect(mocks.refresh).toHaveBeenCalledWith('hearts')
  })

  it('publishing the theme the site already wears writes no style', async () => {
    expect(await saveWebsiteDraft('hearts.example', 0, nocturne, true)).toMatchObject({ ok: true })
    expect(mocks.apply).not.toHaveBeenCalled()
    expect(rpcNames()).toEqual(['save_website_editor'])
  })

  it('writes the draft global styles, key-scoped, when they differ from the live ones', async () => {
    expect(await saveWebsiteDraft('hearts.example', 0, { ...nocturne, look: { corners: 'soft' } }, true)).toMatchObject({ ok: true })
    const style = mocks.rpc.mock.calls.find((c) => c[0] === 'set_space_preferences')?.[1] as { p_patch: Record<string, unknown> }
    expect(Object.keys(style.p_patch).sort()).toEqual(['siteStyle', 'theme'])
    expect(style.p_patch.siteStyle).toMatchObject({ theme: 'midnight', corners: 'soft' })
  })

  it('says so when the theme could not be switched after the pages published', async () => {
    mocks.apply.mockResolvedValue({ ok: false, error: 'no' })
    expect(await saveWebsiteDraft('hearts.example', 0, designer, true)).toMatchObject({ ok: false, error: expect.stringContaining('Publish again') })
  })

  it('refuses to schedule a switch to another theme', async () => {
    const result = await saveWebsiteDraft('hearts.example', 0, designer, false, new Date(Date.now() + 3_600_000).toISOString())
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Publish now') })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
