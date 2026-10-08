import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ host: 'hearts.example', staff: false, allowed: true, opens: true, preferences: {} as unknown, rpc: vi.fn(), refresh: vi.fn(), presenceWrite: vi.fn(), presenceRead: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => ({ get: () => mocks.host }), cookies: async () => ({ get: () => ({ value: 'token' }) }) }))
vi.mock('@/lib/sites/hosted', () => ({ resolveHostedSpace: async () => ({ id: 'space', slug: 'hearts' }) }))
vi.mock('@/lib/sites/site-admin-pass', () => ({ SITE_ADMIN_COOKIE: 'admin', readSiteAdminPass: () => ({ staff: mocks.staff, profileId: 'owner' }), passOpensSite: () => mocks.opens }))
vi.mock('@/lib/sites/site-admin', () => ({ siteAdminAllowed: async () => mocks.allowed, readSiteAdminAuthor: async () => ({ name: 'Owner' }) }))
vi.mock('@/lib/sites/site-cache', () => ({ refreshSite: mocks.refresh }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: (table: string) => table === 'website_editor_presence' ? { upsert: mocks.presenceWrite, select: () => ({ eq: () => ({ gte: () => ({ limit: mocks.presenceRead }) }) }) } : ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { preferences: mocks.preferences, owner_profile_id: 'owner' }, error: null }) }) }) }) }) }))
import { saveWebsiteDraft, syncWebsitePresence } from './actions'
import { nextWebsiteState, type WebsiteEditorState, type WebsiteSnapshot } from './state'
const draft: WebsiteSnapshot = { theme: 'DAWN', pages: [{ slug: 'home', label: 'Home', doc: { root: {}, content: [] }, seo: { title: '', description: '' }, comments: [] }] }
describe('website editor authorization and concurrency', () => {
  beforeEach(() => { mocks.host = 'hearts.example'; mocks.staff = false; mocks.allowed = true; mocks.opens = true; mocks.preferences = {}; mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null }); mocks.refresh.mockReset(); mocks.presenceWrite.mockReset().mockResolvedValue({ error: null }); mocks.presenceRead.mockReset().mockResolvedValue({ data: [{ profile_id: 'other', name: 'Actual editor', cursor: null }, { profile_id: 'owner', name: 'Owner', cursor: null }], error: null }) })
  it.each(['staff', 'foreign host', 'revoked membership', 'foreign pass'])('denies %s before writing', async (kind) => {
    if (kind === 'staff') mocks.staff = true
    if (kind === 'foreign host') mocks.host = 'other.example'
    if (kind === 'revoked membership') mocks.allowed = false
    if (kind === 'foreign pass') mocks.opens = false
    expect((await saveWebsiteDraft('hearts.example', 0, draft)).ok).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('validates cursor coordinates and returns actual other editors only', async () => {
    expect(await syncWebsitePresence('hearts.example', { pageSlug: 'home', blockId: 'hero', x: 2, y: 0 })).toMatchObject({ ok: false })
    expect(mocks.presenceWrite).not.toHaveBeenCalled()
    expect(await syncWebsitePresence('hearts.example', null)).toEqual({ ok: true, people: [{ profileId: 'other', name: 'Actual editor', cursor: null }] })
    expect(mocks.presenceWrite).toHaveBeenCalledWith(expect.objectContaining({ space_id: 'space', profile_id: 'owner', name: 'Owner' }), { onConflict: 'space_id,profile_id' })
  })
  it('saves a private draft with compare-and-swap and leaves public cache untouched', async () => {
    const result = await saveWebsiteDraft('hearts.example', 0, draft)
    expect(result.ok).toBe(true)
    expect(mocks.rpc).toHaveBeenCalledWith('save_website_editor', expect.objectContaining({ p_expected_revision: 0, p_publish: false, p_state: expect.objectContaining({ published: null }) }))
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
  it('reports both stale reads and races as conflicts', async () => {
    const current: WebsiteEditorState = { v: 1, revision: 0, draft, published: null, versions: [] }
    mocks.preferences = { websiteEditor: nextWebsiteState(current, draft, false, 'owner') }
    expect(await saveWebsiteDraft('hearts.example', 0, draft)).toMatchObject({ ok: false, conflict: true })
    mocks.preferences = {}; mocks.rpc.mockResolvedValue({ data: false, error: null })
    expect(await saveWebsiteDraft('hearts.example', 0, draft)).toMatchObject({ ok: false, conflict: true })
  })
  it('publishes only after a successful atomic write', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: 'offline' })
    expect((await saveWebsiteDraft('hearts.example', 0, draft, true)).ok).toBe(false)
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect((await saveWebsiteDraft('hearts.example', 0, draft, true)).ok).toBe(true)
    expect(mocks.refresh).toHaveBeenCalledWith('hearts')
  })
})
