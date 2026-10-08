import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ host: 'hearts.example', staff: false, allowed: true, opens: true, upload: vi.fn(), query: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => ({ get: () => mocks.host }), cookies: async () => ({ get: () => ({ value: 'token' }) }) }))
vi.mock('@/lib/sites/hosted', () => ({ resolveHostedSpace: async () => ({ id: 'space', slug: 'hearts', name: 'Hearts' }) }))
vi.mock('@/lib/sites/site-admin-pass', () => ({ SITE_ADMIN_COOKIE: 'admin', readSiteAdminPass: () => ({ staff: mocks.staff, profileId: 'owner' }), passOpensSite: () => mocks.opens }))
vi.mock('@/lib/sites/site-admin', () => ({ siteAdminAllowed: async () => mocks.allowed }))
vi.mock('@/lib/loom/authorized-image-upload', () => ({ uploadAuthorizedLoomImage: mocks.upload }))
vi.mock('@/lib/library/store', () => ({ notExpiredOr: () => 'expires_at.is.null', toPickAsset: (value: unknown) => value }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => {
  if (table === 'spaces') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { preferences: {}, owner_profile_id: 'owner' }, error: null }) }) }) }
  mocks.query(table)
  const query = { select: vi.fn(), eq: vi.fn(), neq: vi.fn(), or: vi.fn(), ilike: vi.fn(), contains: vi.fn(), order: vi.fn(), limit: async () => ({ data: [{ id: 'image', title: 'Original', url: 'https://images.example/original.jpg', tags: ['original'], is_protected: false }, { id: 'private', url: 'https://images.example/master.jpg', is_protected: true }], error: null }) }
  for (const method of ['select', 'eq', 'neq', 'or', 'ilike', 'contains', 'order'] as const) query[method].mockReturnValue(query)
  return query
} }) }))
import { uploadWebsiteLoomImage, websiteLoomImages, websiteLoomScope, websiteLoomScopes } from './media-actions'
describe('own-domain website Loom access', () => {
  beforeEach(() => { mocks.host = 'hearts.example'; mocks.staff = false; mocks.allowed = true; mocks.opens = true; mocks.upload.mockReset().mockResolvedValue({ id: 'photo', url: 'https://images.example/new.jpg' }); mocks.query.mockReset() })
  it.each(['staff', 'foreign host', 'revoked membership', 'foreign pass'])('denies %s for reads and uploads', async (kind) => {
    if (kind === 'staff') mocks.staff = true
    if (kind === 'foreign host') mocks.host = 'other.example'
    if (kind === 'revoked membership') mocks.allowed = false
    if (kind === 'foreign pass') mocks.opens = false
    expect((await websiteLoomScopes('hearts.example')).scopes).toEqual([])
    expect(await websiteLoomImages('hearts.example', 'space')).toEqual({ assets: [], tags: [] })
    expect(await uploadWebsiteLoomImage('hearts.example', 'space', new FormData())).toHaveProperty('error')
    expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.query).not.toHaveBeenCalled()
  })
  it('binds uploaded media to the authorized site and caller', async () => {
    const data = new FormData()
    expect(await uploadWebsiteLoomImage('hearts.example', 'hearts', data)).toEqual({ id: 'photo', url: 'https://images.example/new.jpg' })
    expect(mocks.upload).toHaveBeenCalledExactlyOnceWith('space', 'owner', data, true)
    expect(await uploadWebsiteLoomImage('hearts.example', 'foreign-space', data)).toHaveProperty('error')
    expect(mocks.upload).toHaveBeenCalledTimes(1)
  })
  it('offers only this site scope and keeps protected master URLs out of photo choices', async () => {
    expect((await websiteLoomScopes('hearts.example')).scopes).toEqual([{ key: 'space', label: 'Hearts', kind: 'space' }])
    expect((await websiteLoomScope('hearts.example', 'mine')).scope).toBeNull()
    expect((await websiteLoomImages('hearts.example', 'space')).assets.map((a) => a.id)).toEqual(['image'])
    expect(await websiteLoomImages('hearts.example', 'another')).toEqual({ assets: [], tags: [] })
  })
})
