import { describe, it, expect, vi, beforeEach } from 'vitest'

// Space Update member INTERACTION actions (owner decision 2026-07-01): ANY signed-in member (free
// included) may react + comment on a Space Update, WITHOUT the community feed's Crew+ gate. These
// tests lock the app-code authority: a signed-in member passes the gate on a space_update thread; an
// anonymous caller is refused; and the thread guard refuses a post that is NOT part of a space_update
// thread (so a crafted request can never react/comment on a normal feed post through this path). The
// DB-layer defense (member-level RLS scoped to post_type = space_update) is proven by the migration;
// here we drive the admin client + auth through mocks so no real IO happens.
//
// The action module also imports the operator/review seams at the top; we stub those so importing the
// module never touches real IO.

// ── Mock seams ────────────────────────────────────────────────────────────────────────────────────
let currentProfileId: string | null = 'me'
vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => currentProfileId,
  getCallerProfile: async () => (currentProfileId ? { id: currentProfileId } : null),
}))
vi.mock('@/lib/spaces/store', () => ({ getVisibleSpaceBySlug: async () => null }))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: async () => ({ canEditProfile: false }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

// A tiny stub of the admin client the actions reach through db(). We model just the two shapes the
// interaction path uses: a `posts` row lookup by id (for the thread walk + parent read), and the
// insert/upsert/delete terminals (which just record the call + return no error).
type PostRow = { id: string; parent_id: string | null; post_type: string; scope_id?: string | null; visibility?: string | null }
let posts: Record<string, PostRow> = {}
const calls: { op: string; table: string; values?: unknown }[] = []

function makeAdmin() {
  return {
    from(table: string) {
      return {
        // select(...).eq('id', v).maybeSingle()  and  select(...).single() after insert
        select() {
          return {
            eq(_col: string, val: string) {
              return {
                maybeSingle: async () => ({ data: posts[val] ?? null }),
                eq: () => ({ eq: async () => ({ error: null }) }),
              }
            },
            single: async () => ({ data: { id: 'new-id' }, error: null }),
          }
        },
        insert(values: Row) {
          calls.push({ op: 'insert', table, values })
          return { select: () => ({ single: async () => ({ data: { id: 'new-id' }, error: null }) }) }
        },
        upsert(values: Row) {
          calls.push({ op: 'upsert', table, values })
          return Promise.resolve({ error: null })
        },
        delete() {
          calls.push({ op: 'delete', table })
          return { eq: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }
        },
        update(values: Row) {
          calls.push({ op: 'update', table, values })
          return { eq: () => ({ eq: async () => ({ error: null }) }) }
        },
      }
    },
  }
}
type Row = Record<string, unknown>
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdmin() }))

import { reactToSpaceUpdate, commentOnSpaceUpdate } from './content-actions'
import { isError } from '@/lib/action-result'

beforeEach(() => {
  currentProfileId = 'me'
  posts = {
    // A space_update anchor and a comment nested under it (post_type 'feed', parent = the anchor).
    anchor: { id: 'anchor', parent_id: null, post_type: 'space_update', scope_id: 'space-1', visibility: 'public' },
    comment: { id: 'comment', parent_id: 'anchor', post_type: 'feed', scope_id: 'space-1', visibility: 'public' },
    // A normal feed post, NOT part of any space_update thread.
    normal: { id: 'normal', parent_id: null, post_type: 'feed', scope_id: 'circle-9', visibility: 'group' },
  }
  calls.length = 0
})

describe('reactToSpaceUpdate (any signed-in member; space_update thread only)', () => {
  it('lets a signed-in member add a reaction on the Update anchor', async () => {
    const r = await reactToSpaceUpdate('anchor', '❤️', true)
    expect(isError(r)).toBe(false)
    expect((r as { data: { active: boolean } }).data.active).toBe(true)
    expect(calls.some((c) => c.op === 'upsert' && c.table === 'post_reactions')).toBe(true)
  })

  it('lets a member react on a COMMENT within the Update thread', async () => {
    const r = await reactToSpaceUpdate('comment', '🔥', true)
    expect(isError(r)).toBe(false)
  })

  it('removes a reaction when activate is false', async () => {
    const r = await reactToSpaceUpdate('anchor', '❤️', false)
    expect(isError(r)).toBe(false)
    expect((r as { data: { active: boolean } }).data.active).toBe(false)
    expect(calls.some((c) => c.op === 'delete' && c.table === 'post_reactions')).toBe(true)
  })

  it('refuses an anonymous caller', async () => {
    currentProfileId = null
    const r = await reactToSpaceUpdate('anchor', '❤️', true)
    expect(isError(r)).toBe(true)
  })

  it('refuses a reaction on a NORMAL feed post (thread guard, not a space_update)', async () => {
    const r = await reactToSpaceUpdate('normal', '❤️', true)
    expect(isError(r)).toBe(true)
    expect(calls.some((c) => c.table === 'post_reactions')).toBe(false)
  })

  it('refuses an emoji outside the curated set', async () => {
    const r = await reactToSpaceUpdate('anchor', 'not-an-emoji', true)
    expect(isError(r)).toBe(true)
  })
})

describe('commentOnSpaceUpdate (any signed-in member; space_update thread only)', () => {
  it('lets a signed-in member comment on the Update anchor', async () => {
    const r = await commentOnSpaceUpdate('willow', 'anchor', 'Nice update')
    expect(isError(r)).toBe(false)
    const insert = calls.find((c) => c.op === 'insert' && c.table === 'posts')
    expect(insert).toBeTruthy()
    // The reply inherits the parent scope + visibility and sets parent_id.
    expect((insert!.values as Row).parent_id).toBe('anchor')
    expect((insert!.values as Row).post_type).toBe('feed')
  })

  it('refuses an anonymous caller', async () => {
    currentProfileId = null
    const r = await commentOnSpaceUpdate('willow', 'anchor', 'Nice update')
    expect(isError(r)).toBe(true)
  })

  it('refuses an empty comment', async () => {
    const r = await commentOnSpaceUpdate('willow', 'anchor', '   ')
    expect(isError(r)).toBe(true)
  })

  it('refuses a comment on a NORMAL feed post (thread guard, not a space_update)', async () => {
    const r = await commentOnSpaceUpdate('willow', 'normal', 'Trying to sneak in')
    expect(isError(r)).toBe(true)
    expect(calls.some((c) => c.op === 'insert' && c.table === 'posts')).toBe(false)
  })
})
