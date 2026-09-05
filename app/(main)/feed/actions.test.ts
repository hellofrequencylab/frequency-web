import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// SCAN-210 · an announcement must land in a circle the author actually belongs to.
//
// THE DEFECT. `createPost` coerces an announcement to `cluster` visibility, then checked membership
// only for `group`. So the scope check that stops a crafted request naming someone else's circle
// never ran on the one post type that pins itself to the top and broadcasts beyond the circle. The
// host+ check above it proves the author may announce; it says nothing about WHERE.
//
// The database was not silent on this — `posts: insert (crew+ in scope)` requires, for `cluster`,
// `scope_id = ANY(private.get_my_circle_ids()) OR EXISTS (select 1 from circles c where
// c.id = posts.scope_id and c.host_id = private.get_my_profile_id())`. The action accepted exactly
// what the policy would refuse, and because it inserts through `createAdminClient()` the policy
// never ran to say so.
//
// SOURCE-SHAPE, per the house archetype, and for the reason that archetype exists: the failure is a
// missing branch, not a wrong value. Nothing observable changes when the check disappears — the post
// still saves — so no runtime test of a happy path would notice.

const ROOT = path.join(import.meta.dirname, '..', '..', '..')
const src = readFileSync(path.join(ROOT, 'app/(main)/feed/actions.ts'), 'utf8')

describe('createPost gates the circle scope', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    expect(src.length).toBeGreaterThan(1000)
    expect(src).toContain('export async function createPost')
  })

  it('applies the scope check to cluster as well as group', () => {
    expect(
      /if \(visibility === 'group' \|\| visibility === 'cluster'\)/.test(src),
      'the scope check names only `group` again. Announcements are coerced to `cluster` at the top ' +
        'of createPost, so they fall straight past it and any host+ account can pin an announcement ' +
        'into any circle (SCAN-210).',
    ).toBe(true)
  })

  it('mirrors the policy: active membership OR hosting that circle', () => {
    expect(src).toContain(".eq('status', 'active')")
    expect(src).toMatch(/\.from\('circles'\)[\s\S]{0,120}\.eq\('host_id', profileId\)/)
    expect(src).toContain('if (!membership && !hosted)')
  })

  it('keeps the host+ check, which answers a different question', () => {
    // "May this account announce at all" and "may it announce HERE" are two gates, and collapsing
    // them back into one is how this reopens.
    expect(src).toContain('HOST_PLUS.includes')
    expect(src).toContain('Only hosts can post an announcement.')
  })

  it('still inserts through the admin client, which is why the check has to be here', () => {
    // If this ever became a caller-scoped client the policy would enforce the rule itself. It does
    // not, so the comment and the check are load-bearing.
    expect(src).toContain('createAdminClient()')
    expect(src).toContain('The admin client bypasses RLS')
  })
})

// ── L7-1 / L7-2 · deletePost, pinPost, unpinPost reach only as far as the policies say ──────────
//
// THE DEFECT. All three ran through the admin client and gated on `HOST_PLUS.includes(community_role)`.
// `host` is self-granted (publishing a Circle runs `ensureHostOnOwnership`, lib/circles/remix.ts), so
// any member who had ever published a circle could delete or pin ANY post on the platform. The
// policies the admin client bypasses (`posts: author delete or host removes in circle`, and the
// UPDATE twin) say `author_id = me OR (host+ AND scope_id IN (circles WHERE host_id = me))`.
//
// RUNTIME, not source-shape, because here the consequence IS observable: a table-driven admin mock
// (the circle members actions.test.ts pattern) records every delete and update, and each case asserts
// what was written and, for the refusals, that NOTHING was.

type Row = Record<string, unknown>
let tables: Record<string, Row[]> = {}
let writes: Array<{ table: string; op: 'delete' | 'update'; patch?: Row; matched: number }> = []

function builder(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let op: 'select' | 'delete' | 'update' = 'select'
  let patch: Row | null = null
  const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
  const api = {
    select() { return api },
    delete() { op = 'delete'; return api },
    update(p: Row) { op = 'update'; patch = p; return api },
    eq(col: string, val: unknown) {
      filters.push((r) => r[col] === val)
      return api
    },
    async maybeSingle() { return { data: rows()[0] ?? null, error: null } },
    then(resolve: (v: { data: Row[]; error: null }) => void) {
      const matched = rows()
      if (op === 'delete') {
        tables[table] = (tables[table] ?? []).filter((r) => !matched.includes(r))
        writes.push({ table, op, matched: matched.length })
      } else if (op === 'update' && patch) {
        for (const r of matched) Object.assign(r, patch)
        writes.push({ table, op, patch, matched: matched.length })
      }
      resolve({ data: matched, error: null })
    },
  }
  return api
}

type Caller = { id: string; community_role: string; webRole: string }
const mocks = vi.hoisted(() => ({
  getCallerProfile: vi.fn<() => Promise<Caller | null>>(),
  getMyProfileId: vi.fn<() => Promise<string | null>>(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((to: string) => { throw new Error(`redirect:${to}`) }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/auth', () => ({
  getCallerProfile: mocks.getCallerProfile,
  getMyProfileId: mocks.getMyProfileId,
}))
vi.mock('@/lib/achievements', () => ({
  processGamificationEvent: async () => {},
  recordStreakActivity: async () => {},
}))
vi.mock('@/lib/gems', () => ({ awardGems: async () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))

import { deletePost, pinPost, unpinPost } from './actions'

const HOST = 'host-1'
const AUTHOR = 'author-1'
const STAFF = 'staff-1'
const MY_CIRCLE = 'circle-mine'
const THEIR_CIRCLE = 'circle-theirs'
const INSIDE = 'post-inside'
const OUTSIDE = 'post-outside'
const UNSCOPED = 'post-unscoped'

function seedFeed() {
  tables = {
    circles: [
      { id: MY_CIRCLE, host_id: HOST },
      { id: THEIR_CIRCLE, host_id: 'someone-else' },
    ],
    posts: [
      { id: INSIDE, author_id: AUTHOR, scope_id: MY_CIRCLE, is_pinned: false },
      { id: OUTSIDE, author_id: AUTHOR, scope_id: THEIR_CIRCLE, is_pinned: false },
      { id: UNSCOPED, author_id: AUTHOR, scope_id: null, is_pinned: true },
    ],
  }
  writes = []
}

const postExists = (id: string) => (tables.posts ?? []).some((r) => r.id === id)
const pinned = (id: string) => (tables.posts ?? []).find((r) => r.id === id)?.is_pinned

const signInAs = (caller: Caller) => {
  mocks.getCallerProfile.mockResolvedValue(caller)
  mocks.getMyProfileId.mockResolvedValue(caller.id)
}
const asHost = { id: HOST, community_role: 'host', webRole: 'none' }
const asAuthor = { id: AUTHOR, community_role: 'member', webRole: 'none' }
const asStaff = { id: STAFF, community_role: 'member', webRole: 'admin' }

beforeEach(() => {
  seedFeed()
  vi.clearAllMocks()
})

describe('deletePost · scope (L7-1)', () => {
  it('a non-staff host is REFUSED on a post outside their circles, and nothing is written', async () => {
    signInAs(asHost)
    await deletePost(OUTSIDE)
    expect(postExists(OUTSIDE)).toBe(true)
    expect(writes).toHaveLength(0)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('a non-staff host is refused on an unscoped post too (no circle, no host arm)', async () => {
    signInAs(asHost)
    await deletePost(UNSCOPED)
    expect(postExists(UNSCOPED)).toBe(true)
    expect(writes).toHaveLength(0)
  })

  it('the same host deletes inside a circle they host', async () => {
    signInAs(asHost)
    await deletePost(INSIDE)
    expect(postExists(INSIDE)).toBe(false)
    expect(writes).toEqual([{ table: 'posts', op: 'delete', matched: 1 }])
  })

  it('the author deletes their own post anywhere', async () => {
    signInAs(asAuthor)
    await deletePost(OUTSIDE)
    expect(postExists(OUTSIDE)).toBe(false)
  })

  it('platform staff (web_role) deletes anywhere, with no community rung', async () => {
    signInAs(asStaff)
    await deletePost(OUTSIDE)
    expect(postExists(OUTSIDE)).toBe(false)
  })

  it('a missing post is a refusal, not a write', async () => {
    signInAs(asStaff)
    await deletePost('post-nope')
    expect(writes).toHaveLength(0)
  })
})

describe('pinPost / unpinPost · scope (L7-2)', () => {
  it('a non-staff host cannot pin outside their circles', async () => {
    signInAs(asHost)
    await pinPost(OUTSIDE)
    expect(pinned(OUTSIDE)).toBe(false)
    expect(writes).toHaveLength(0)
  })

  it('a non-staff host cannot unpin outside their circles', async () => {
    signInAs(asHost)
    await unpinPost(UNSCOPED)
    expect(pinned(UNSCOPED)).toBe(true)
    expect(writes).toHaveLength(0)
  })

  it('the same host pins and unpins inside a circle they host', async () => {
    signInAs(asHost)
    await pinPost(INSIDE)
    expect(pinned(INSIDE)).toBe(true)
    await unpinPost(INSIDE)
    expect(pinned(INSIDE)).toBe(false)
    expect(writes.map((w) => w.patch)).toEqual([{ is_pinned: true }, { is_pinned: false }])
  })

  it('the author may pin their own post (the UPDATE policy admits the author)', async () => {
    signInAs(asAuthor)
    await pinPost(OUTSIDE)
    expect(pinned(OUTSIDE)).toBe(true)
  })

  it('platform staff pins anywhere', async () => {
    signInAs(asStaff)
    await pinPost(OUTSIDE)
    expect(pinned(OUTSIDE)).toBe(true)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/feed')
  })

  it('signed out is a silent return', async () => {
    mocks.getCallerProfile.mockResolvedValue(null)
    await pinPost(INSIDE)
    expect(writes).toHaveLength(0)
  })
})
