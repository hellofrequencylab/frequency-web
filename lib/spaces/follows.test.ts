import { describe, it, expect, vi, beforeEach } from 'vitest'

// The network-FOLLOW ledger (ENTITY-SPACES-BUILD §A.4). What is locked here, all network-free (the
// supabase admin client + auth + store seams are mocked):
//   1. followSpace / unfollowSpace are IDEMPOTENT and authenticated: an anon caller is rejected and
//      nothing is written; following twice is one row; unfollowing what you don't follow is a no-op.
//   2. The READS are fail-safe: isFollowing reflects the row, listFollowedSpaceIds returns the
//      viewer's set (empty for a missing profile).
//   3. The reads are SCOPED: a follow of Space A never resolves for Space B (no cross-space leak).

// ── Mock the caller identity + Space resolver (toggled per test) ───────────────────────────────────
let currentProfileId: string | null = 'alice-0000-4000-a000-00000000alic'
vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => currentProfileId,
}))

let resolvedSpace: { id: string; slug: string } | null = { id: 'space-a', slug: 'river-yoga' }
vi.mock('./store', () => ({
  getSpaceById: async () => resolvedSpace,
}))

// revalidatePath is a no-op in tests (mirrors profile-settings.test.ts).
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

// ── A chainable admin-client mock backed by an in-memory store ──────────────────────────────────────
// rows = the set of follow rows. Each is { space_id, follower_profile_id }. The unique (space_id,
// follower_profile_id) key is enforced by the upsert mock (a second upsert of the same pair is a no-op).
type FollowRow = { id: string; space_id: string; follower_profile_id: string }
const store: { rows: FollowRow[] } = { rows: [] }
let nextId = 1

function builder() {
  const filters: { space_id?: string; follower_profile_id?: string } = {}
  let mode: 'select' | 'upsert' | 'delete' = 'select'
  let head = false
  let upsertPayload: { space_id: string; follower_profile_id: string } | null = null

  function matched(): FollowRow[] {
    return store.rows.filter(
      (r) =>
        (filters.space_id === undefined || r.space_id === filters.space_id) &&
        (filters.follower_profile_id === undefined ||
          r.follower_profile_id === filters.follower_profile_id),
    )
  }

  const api = {
    select(_cols: string, opts?: { count?: 'exact'; head?: boolean }) {
      if (opts?.head) head = true
      return api
    },
    eq(col: string, val: string) {
      if (col === 'space_id') filters.space_id = val
      if (col === 'follower_profile_id') filters.follower_profile_id = val
      return api
    },
    upsert(row: Record<string, unknown>) {
      mode = 'upsert'
      upsertPayload = {
        space_id: row.space_id as string,
        follower_profile_id: row.follower_profile_id as string,
      }
      return api
    },
    delete() {
      mode = 'delete'
      return api
    },
    async maybeSingle() {
      if (mode === 'upsert' && upsertPayload) {
        const existing = store.rows.find(
          (r) =>
            r.space_id === upsertPayload!.space_id &&
            r.follower_profile_id === upsertPayload!.follower_profile_id,
        )
        if (existing) return { data: { id: existing.id }, error: null }
        const inserted: FollowRow = { id: `f${nextId++}`, ...upsertPayload }
        store.rows.push(inserted)
        return { data: { id: inserted.id }, error: null }
      }
      const hit = matched()[0]
      return { data: hit ? { id: hit.id } : null, error: null }
    },
    // The thenable terminal: a delete prunes matched rows; a select yields the matched rows + count.
    then(
      resolve: (r: { data: FollowRow[] | null; error: null; count: number | null }) => unknown,
    ) {
      if (mode === 'delete') {
        const keep = store.rows.filter((r) => !matched().includes(r))
        store.rows = keep
        return Promise.resolve(resolve({ data: null, error: null, count: null }))
      }
      const rows = matched()
      return Promise.resolve(
        resolve({ data: head ? [] : rows, error: null, count: rows.length }),
      )
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => builder() }),
}))

import {
  followSpace,
  unfollowSpace,
  isFollowing,
  listFollowedSpaceIds,
} from './follows'

const ALICE = 'alice-0000-4000-a000-00000000alic'
const BOB = 'bob00000-0000-4000-a000-0000000000bo'
const SPACE_A = 'space-a'
const SPACE_B = 'space-b'

beforeEach(() => {
  store.rows = []
  nextId = 1
  currentProfileId = ALICE
  resolvedSpace = { id: SPACE_A, slug: 'river-yoga' }
})

describe('followSpace / unfollowSpace (writes)', () => {
  it('an anonymous caller cannot follow, and nothing is written', async () => {
    currentProfileId = null
    const result = await followSpace(SPACE_A)
    expect('error' in result).toBe(true)
    expect(store.rows).toHaveLength(0)
  })

  it('rejects a follow when the space does not exist', async () => {
    resolvedSpace = null
    const result = await followSpace(SPACE_A)
    expect('error' in result).toBe(true)
    expect(store.rows).toHaveLength(0)
  })

  it('follows a space (one row) and is IDEMPOTENT: following twice stays one row', async () => {
    expect('data' in (await followSpace(SPACE_A))).toBe(true)
    expect(store.rows).toHaveLength(1)
    expect('data' in (await followSpace(SPACE_A))).toBe(true)
    expect(store.rows).toHaveLength(1) // the unique key collapses the re-follow
    expect(store.rows[0]).toMatchObject({ space_id: SPACE_A, follower_profile_id: ALICE })
  })

  it('unfollows a space (removes the row) and is IDEMPOTENT when not following', async () => {
    await followSpace(SPACE_A)
    expect(store.rows).toHaveLength(1)
    expect('data' in (await unfollowSpace(SPACE_A))).toBe(true)
    expect(store.rows).toHaveLength(0)
    // Unfollowing again, with no row, is still a no-op success.
    expect('data' in (await unfollowSpace(SPACE_A))).toBe(true)
    expect(store.rows).toHaveLength(0)
  })

  it('an anonymous caller cannot unfollow', async () => {
    currentProfileId = null
    expect('error' in (await unfollowSpace(SPACE_A))).toBe(true)
  })
})

describe('the reads (fail-safe, scoped)', () => {
  it('isFollowing reflects the row; false for a missing profile', async () => {
    await followSpace(SPACE_A)
    expect(await isFollowing(SPACE_A, ALICE)).toBe(true)
    expect(await isFollowing(SPACE_A, BOB)).toBe(false) // Bob follows nothing
    expect(await isFollowing(SPACE_A, null)).toBe(false) // anon
  })

  it('isFollowing is SCOPED: a follow of A never resolves for B', async () => {
    await followSpace(SPACE_A) // Alice follows A
    expect(await isFollowing(SPACE_A, ALICE)).toBe(true)
    expect(await isFollowing(SPACE_B, ALICE)).toBe(false) // no leak across the boundary
  })

  it('listFollowedSpaceIds returns the viewer’s set; empty for a missing profile', async () => {
    await followSpace(SPACE_A) // Alice follows A
    resolvedSpace = { id: SPACE_B, slug: 'forest-sound' }
    await followSpace(SPACE_B) // Alice follows B too
    const ids = await listFollowedSpaceIds(ALICE)
    expect([...ids].sort()).toEqual([SPACE_A, SPACE_B])
    expect((await listFollowedSpaceIds(BOB)).size).toBe(0) // Bob follows nothing
    expect((await listFollowedSpaceIds(null)).size).toBe(0) // anon
  })
})
