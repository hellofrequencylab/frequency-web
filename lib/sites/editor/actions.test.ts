import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ host: 'hearts.example', staff: false, allowed: true, opens: true, preferences: {} as unknown, rpc: vi.fn(), refresh: vi.fn(), presenceWrite: vi.fn(), presenceRead: vi.fn(), features: vi.fn(), complete: vi.fn(), enabled: true, limited: false, overBudget: false, ledger: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => ({ get: () => mocks.host }), cookies: async () => ({ get: () => ({ value: 'token' }) }) }))
vi.mock('@/lib/sites/hosted', () => ({ resolveHostedSpace: async () => ({ id: 'space', slug: 'hearts' }) }))
vi.mock('@/lib/sites/site-admin-pass', () => ({ SITE_ADMIN_COOKIE: 'admin', readSiteAdminPass: () => ({ staff: mocks.staff, profileId: 'owner' }), passOpensSite: () => mocks.opens }))
vi.mock('@/lib/sites/site-admin', () => ({ siteAdminAllowed: async () => mocks.allowed, readSiteAdminAuthor: async () => ({ name: 'Owner' }) }))
vi.mock('@/lib/sites/site-cache', () => ({ refreshSite: mocks.refresh }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: (table: string) => table === 'website_editor_presence' ? { upsert: mocks.presenceWrite, select: () => ({ eq: () => ({ gte: () => ({ limit: mocks.presenceRead }) }) }) } : ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { preferences: mocks.preferences, owner_profile_id: 'owner' }, error: null }) }) }) }) }) }))
vi.mock('./live-data', () => ({ resolveWebsiteFeatureItems: mocks.features }))
vi.mock('@/lib/ai/complete', () => ({ completeText: mocks.complete }))
vi.mock('@/lib/ai/client', () => ({ aiEnabled: () => mocks.enabled }))
vi.mock('@/lib/ai/rate-limit', () => ({ aiRateLimited: async () => mocks.limited }))
vi.mock('@/lib/ai/usage', () => ({ featureOverBudget: async () => mocks.overBudget, recordAiUsage: mocks.ledger }))
vi.mock('@/lib/ai/voice', () => ({ withVoice: (text: string) => text }))
import { saveWebsiteDraft, syncWebsitePresence, loadWebsiteFeatureSource, proposeWebsiteText } from './actions'
import { nextWebsiteState, type WebsiteEditorState, type WebsiteSnapshot } from './state'
const draft: WebsiteSnapshot = { theme: 'DAWN', pages: [{ slug: 'home', label: 'Home', doc: { root: {}, content: [] }, seo: { title: '', description: '' }, comments: [] }] }
describe('website editor authorization and concurrency', () => {
  beforeEach(() => { mocks.complete.mockReset(); mocks.ledger.mockReset(); mocks.enabled = true; mocks.limited = false; mocks.overBudget = false; mocks.host = 'hearts.example'; mocks.staff = false; mocks.allowed = true; mocks.opens = true; mocks.preferences = {}; mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null }); mocks.refresh.mockReset(); mocks.presenceWrite.mockReset().mockResolvedValue({ error: null }); mocks.presenceRead.mockReset().mockResolvedValue({ data: [{ profile_id: 'other', name: 'Actual editor', cursor: null }, { profile_id: 'owner', name: 'Owner', cursor: null }], error: null }) })
  it.each(['staff', 'foreign host', 'revoked membership', 'foreign pass'])('denies %s before writing', async (kind) => {
    if (kind === 'staff') mocks.staff = true
    if (kind === 'foreign host') mocks.host = 'other.example'
    if (kind === 'revoked membership') mocks.allowed = false
    if (kind === 'foreign pass') mocks.opens = false
    expect((await saveWebsiteDraft('hearts.example', 0, draft)).ok).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('loads a newly selected source only for the authenticated own site', async () => {
    mocks.features.mockReset().mockResolvedValue([{ title: 'Actual event', body: '', text: '', price: '', href: '/events/event' }])
    expect(await loadWebsiteFeatureSource('hearts.example', 'events')).toMatchObject({ ok: true, items: [{ title: 'Actual event' }] })
    expect(mocks.features).toHaveBeenCalledWith('space', 'events')
    for (const denial of ['staff', 'foreign', 'revoked']) {
      mocks.staff = denial === 'staff'; mocks.host = denial === 'foreign' ? 'other.example' : 'hearts.example'; mocks.allowed = denial !== 'revoked'
      mocks.features.mockClear()
      expect(await loadWebsiteFeatureSource('hearts.example', 'memberships')).toMatchObject({ ok: false })
      expect(mocks.features).not.toHaveBeenCalled()
    }
    expect(await loadWebsiteFeatureSource('hearts.example', 'private-library')).toMatchObject({ ok: false })
  })
  it('returns AI proposals as plain text even with malformed nested tags', async () => {
    mocks.complete.mockResolvedValue({ text: 'Safe **copy** <scr<script>ipt>alert(1)</scr</script>ipt> <script', tier: 'haiku', usage: {} })
    const result = await proposeWebsiteText('hearts.example', 'Shorten this copy', 'Original passage')
    expect(result.ok).toBe(true)
    expect(mocks.complete).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ accounting: { feature: 'website-editor', profileId: 'owner', spaceId: 'space' } }))
    expect(mocks.ledger).not.toHaveBeenCalled()
    if (result.ok) {
      expect(result.text).not.toMatch(/[<>]/)
      expect(result.text).toContain('**copy**')
      expect(result.text).not.toContain('<script')
    }
  })
  it.each(['foreign host', 'revoked membership', 'disabled', 'rate limited', 'budget exhausted'])('does not dispatch website AI when %s', async (reason) => {
    if (reason === 'foreign host') mocks.host = 'other.example'
    if (reason === 'revoked membership') mocks.allowed = false
    if (reason === 'disabled') mocks.enabled = false
    if (reason === 'rate limited') mocks.limited = true
    if (reason === 'budget exhausted') mocks.overBudget = true
    expect(await proposeWebsiteText('hearts.example', 'Shorten', 'Original')).toMatchObject({ ok: false })
    expect(mocks.complete).not.toHaveBeenCalled()
    expect(mocks.ledger).not.toHaveBeenCalled()
  })
  it('preserves the website proposal fallback on central completion failure without a local usage write', async () => {
    mocks.complete.mockRejectedValue(new Error('accounting unavailable'))
    expect(await proposeWebsiteText('hearts.example', 'Shorten', 'Original')).toEqual({ ok: false, error: 'Vera could not prepare that change. Try again in a moment.' })
    expect(mocks.complete).toHaveBeenCalledOnce()
    expect(mocks.ledger).not.toHaveBeenCalled()
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
  it('cancels a scheduled publish atomically without changing the live version', async () => {
    const published = nextWebsiteState({ v: 1, revision: 0, draft, published: null, versions: [] }, draft, true, 'Owner')
    const scheduled = nextWebsiteState(published, { ...draft, theme: 'Midnight' }, false, 'Owner', undefined, '2099-01-01T00:00:00Z')
    mocks.preferences = { websiteEditor: scheduled }
    const result = await saveWebsiteDraft('hearts.example', scheduled.revision, scheduled.draft, false, null)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.state.scheduled).toBeNull()
    expect(result.state.published).toEqual(published.published)
    expect(result.state.versions).toEqual(published.versions)
    expect(mocks.rpc).toHaveBeenCalledWith('save_website_editor', expect.objectContaining({ p_expected_revision: scheduled.revision, p_publish: false, p_state: expect.objectContaining({ scheduled: null }) }))
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
  it.each(['foreign host', 'revoked membership', 'stale revision'])('refuses schedule cancellation for %s', async (reason) => {
    if (reason === 'foreign host') mocks.host = 'other.example'
    if (reason === 'revoked membership') mocks.allowed = false
    if (reason === 'stale revision') mocks.preferences = { websiteEditor: nextWebsiteState({ v: 1, revision: 0, draft, published: null, versions: [] }, draft, false, 'Owner', undefined, '2099-01-01T00:00:00Z') }
    expect(await saveWebsiteDraft('hearts.example', 0, draft, false, null)).toMatchObject({ ok: false })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
  it('rejects combining cancellation with publishing', async () => {
    expect(await saveWebsiteDraft('hearts.example', 0, draft, true, null)).toMatchObject({ ok: false })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
  it('reports both stale reads and races as conflicts', async () => {
    const current: WebsiteEditorState = { v: 1, revision: 0, draft, published: null, versions: [] }
    mocks.preferences = { websiteEditor: nextWebsiteState(current, draft, false, 'owner') }
    expect(await saveWebsiteDraft('hearts.example', 0, draft)).toMatchObject({ ok: false, conflict: true })
    mocks.preferences = {}; mocks.rpc.mockResolvedValue({ data: false, error: null })
    expect(await saveWebsiteDraft('hearts.example', 0, draft)).toMatchObject({ ok: false, conflict: true })
  })
  it('stamps first-save review comments from authenticated identity rather than client claims', async () => {
    const commented = structuredClone(draft)
    commented.pages[0].doc.content = [{ type: 'Text', props: { id: 'text', body: 'Original copy' } }]
    commented.pages[0].comments = [{ id: 'new-comment', blockId: 'text', text: 'Review', author: 'Someone else', createdAt: '2000-01-01T00:00:00Z', resolved: false }]
    const result = await saveWebsiteDraft('hearts.example', 0, commented)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.state.draft.pages[0].comments[0].author).toBe('Owner')
      expect(result.state.draft.pages[0].comments[0].createdAt).not.toBe('2000-01-01T00:00:00Z')
    }
  })
  it('stamps new reply authors and preserves existing reply attribution on subsequent saves', async () => {
    const commented = structuredClone(draft)
    commented.pages[0].doc.content = [{ type: 'Text', props: { id: 'text', body: 'Copy' } }]
    commented.pages[0].comments = [{ id: 'comment', blockId: 'text', text: 'Review', author: 'Forgery', createdAt: '2000-01-01T00:00:00Z', resolved: false, x: 0.2, y: 0.8, replies: [{ id: 'reply', body: 'Reply', author: 'Forgery', createdAt: '2000-01-01T00:00:00Z' }] }]
    const first = await saveWebsiteDraft('hearts.example', 0, commented)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const reply = first.state.draft.pages[0].comments[0].replies![0]
    expect(reply.author).toBe('Owner'); expect(reply.createdAt).not.toBe('2000-01-01T00:00:00Z')
    mocks.preferences = { websiteEditor: first.state }
    commented.pages[0].comments[0].replies![0].author = 'Another forgery'
    const second = await saveWebsiteDraft('hearts.example', 1, commented)
    if (!second.ok) throw new Error(second.error)
    expect(second.state.draft.pages[0].comments[0].replies![0]).toEqual(reply)
  })
  it('publishes only after a successful atomic write', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: 'offline' })
    expect((await saveWebsiteDraft('hearts.example', 0, draft, true)).ok).toBe(false)
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect((await saveWebsiteDraft('hearts.example', 0, draft, true)).ok).toBe(true)
    expect(mocks.refresh).toHaveBeenCalledWith('hearts')
  })
})
