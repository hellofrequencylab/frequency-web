import { describe, expect, it, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const maybeSingle = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc,
    from: () => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'limit']) q[m] = () => q
      q.maybeSingle = maybeSingle
      q.then = (res: (v: unknown) => unknown) => res({ data: [{ id: 'v2', revision: 2, title: 'T', note: null, created_at: 'now', created_by: null }], error: null })
      return q
    },
  }),
}))

import { publishVersioned, revertToVersion, listPageVersions, readPageVersion } from './versions'

beforeEach(() => {
  rpc.mockReset()
  maybeSingle.mockReset()
})

describe('page versions', () => {
  it('publishes through the one SQL function and returns the new revision', async () => {
    rpc.mockResolvedValue({ data: [{ version_id: 'v1', revision: 1 }], error: null })
    const out = await publishVersioned({ spaceId: 's', slug: 'home', title: 'Home', data: { content: [] }, profileId: 'p', note: 'x' })
    expect(out).toEqual({ versionId: 'v1', revision: 1 })
    expect(rpc).toHaveBeenCalledWith('publish_page_version', expect.objectContaining({ p_space_id: 's', p_slug: 'home', p_by: 'p', p_note: 'x' }))
  })

  it('throws on a failed publish instead of swallowing it', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(publishVersioned({ spaceId: 's', slug: 'home', title: 'Home', data: {}, profileId: null })).rejects.toThrow('boom')
  })

  it('reverts by pointer swap', async () => {
    rpc.mockResolvedValue({ data: 3, error: null })
    expect(await revertToVersion({ spaceId: 's', slug: 'home', versionId: 'v3', profileId: null })).toEqual({ revision: 3 })
    expect(rpc).toHaveBeenCalledWith('revert_page_to_version', { p_space_id: 's', p_slug: 'home', p_version_id: 'v3' })
  })

  it('lists nothing for a page that does not exist, and reads only a page-owned version', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await listPageVersions('s', 'nope')).toEqual([])
    expect(await readPageVersion('s', 'nope', 'v')).toBeNull()
    maybeSingle.mockResolvedValueOnce({ data: { id: 'pg' }, error: null }).mockResolvedValueOnce({ data: { data: { a: 1 } }, error: null })
    expect(await readPageVersion('s', 'home', 'v')).toEqual({ a: 1 })
  })
})
