import { describe, it, expect, vi } from 'vitest'
import { getLiveData } from './live-data'

// ─────────────────────────────────────────────────────────────────────────────
// TRUTHFULNESS GATE — a failed read must not arrive as an empty one.
//
// `supabase.rpc()` RESOLVES with `{ data: null, error }` on a query-level failure; it does
// not reject. So the old `postsResult.data ?? []` turned one broken RPC into `posts: []`
// inside a perfectly defined payload, indistinguishable at the prop boundary from a
// community that genuinely posted nothing. The marketing routes cache with ISR
// (`revalidate = 3600`), so the resulting "No posts to show right now" stood on a public
// page for an hour as a claim about the community.
//
// `getLiveData` still fails soft (a broken RPC must never 500 a marketing page), so the
// defaults are unchanged. What is new is `status`: the fields are the fallbacks, the map
// is the truth. These tests pin that the map matches what actually happened.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('./live-pricing', () => ({ getLivePricing: async () => ({}) }))

type RpcOutcome = { data?: unknown; error?: unknown; throws?: boolean }

/** A Supabase stand-in whose every RPC outcome is scripted by name. Anything unscripted
 *  resolves empty-but-successful, so each test names only the RPC it cares about.
 *  Typed off `getLiveData`'s own parameter, so it can never drift from what it is standing in
 *  for. `rpc` is the entire surface this module touches. */
type LiveDataClient = Parameters<typeof getLiveData>[0]

function client(script: Record<string, RpcOutcome>) {
  const calls: string[] = []
  const supabase = {
    rpc: (name: string) => {
      calls.push(name)
      const outcome = script[name] ?? { data: null }
      if (outcome.throws) return Promise.reject(new Error(`${name} blew up`))
      return Promise.resolve({ data: outcome.data ?? null, error: outcome.error ?? null })
    },
  }
  return { supabase: supabase as unknown as LiveDataClient, calls }
}

const row = (id: string) => ({
  id,
  body: 'Brought oranges to the Thursday Circle.',
  created_at: '2026-07-01T12:00:00.000Z',
  media_urls: null,
  author_display_name: 'Rae Fields',
  author_handle: 'rae',
  author_avatar_url: null,
})

const ERROR = { error: { message: 'permission denied for function', code: '42501' } }

describe('getLiveData reports which reads delivered', () => {
  it('marks every field ok when every RPC delivered', async () => {
    const { supabase } = client({
      public_featured_posts: { data: [row('p1')] },
      public_member_count: { data: 1234 },
      public_active_circle_count: { data: 56 },
      public_events: { data: [] },
    })
    const live = await getLiveData(supabase)
    expect(live.status).toEqual({ memberCount: 'ok', circleCount: 'ok', upcomingEvents: 'ok', posts: 'ok' })
    expect(live.memberCount).toBe(1234)
    expect(live.postsCurated).toBe(true)
  })

  it('marks a field errored when its RPC resolves with `{ data: null, error }`', async () => {
    const { supabase } = client({ public_member_count: ERROR, public_active_circle_count: { data: 56 } })
    const live = await getLiveData(supabase)
    expect(live.status.memberCount).toBe('error')
    expect(live.status.circleCount).toBe('ok')
  })

  it('marks a field errored when its RPC rejects outright', async () => {
    const { supabase } = client({ public_events: { throws: true } })
    const live = await getLiveData(supabase)
    expect(live.status.upcomingEvents).toBe('error')
  })

  it('keeps the fail-soft defaults, so no consumer has to guard a null', async () => {
    const { supabase } = client({
      public_featured_posts: ERROR,
      public_posts: ERROR,
      public_member_count: ERROR,
      public_events: ERROR,
      public_active_circle_count: { throws: true },
    })
    const live = await getLiveData(supabase)
    expect(live.memberCount).toBe(0)
    expect(live.circleCount).toBe(0)
    expect(live.upcomingEvents).toEqual([])
    expect(live.posts).toEqual([])
    expect(live.status).toEqual({
      memberCount: 'error',
      circleCount: 'error',
      upcomingEvents: 'error',
      posts: 'error',
    })
  })

  it('does not reject when every read fails, because a broken RPC must not 500 a page', async () => {
    const { supabase } = client({
      public_featured_posts: { throws: true },
      public_posts: { throws: true },
      public_member_count: { throws: true },
      public_events: { throws: true },
      public_active_circle_count: { throws: true },
    })
    await expect(getLiveData(supabase)).resolves.toBeTruthy()
  })

  it('still runs the other five reads when one rejects', async () => {
    // One rejection used to take the whole Promise.all down, which is how a single broken
    // RPC erased the counts AND the events AND the posts from a page at once.
    const { supabase } = client({ public_member_count: { throws: true }, public_active_circle_count: { data: 56 } })
    const live = await getLiveData(supabase)
    expect(live.circleCount).toBe(56)
    expect(live.status.circleCount).toBe('ok')
  })
})

describe('posts status follows whichever read actually produced the list', () => {
  it('is ok when the curated set won', async () => {
    const { supabase } = client({ public_featured_posts: { data: [row('p1')] }, public_posts: ERROR })
    const live = await getLiveData(supabase)
    // The fallback never ran into the output, so its failure says nothing about `posts`.
    expect(live.postsCurated).toBe(true)
    expect(live.status.posts).toBe('ok')
  })

  it('is ok when curation is empty but the latest-public fallback delivered', async () => {
    const { supabase } = client({ public_featured_posts: { data: [] }, public_posts: { data: [row('p2')] } })
    const live = await getLiveData(supabase)
    expect(live.postsCurated).toBe(false)
    expect(live.posts).toHaveLength(1)
    expect(live.status.posts).toBe('ok')
  })

  it('is ok when the curated read FAILED but the wider fallback delivered an empty list', async () => {
    // The fallback is the wider set. If it says there is nothing, there is nothing, whatever
    // happened to Vera's picks.
    const { supabase } = client({ public_featured_posts: ERROR, public_posts: { data: [] } })
    const live = await getLiveData(supabase)
    expect(live.posts).toEqual([])
    expect(live.status.posts).toBe('ok')
  })

  it('is error when the fallback is the read that failed', async () => {
    const { supabase } = client({ public_featured_posts: { data: [] }, public_posts: ERROR })
    const live = await getLiveData(supabase)
    expect(live.posts).toEqual([])
    expect(live.status.posts).toBe('error')
  })
})

describe('pricing rides along without a status it cannot honestly report', () => {
  it('resolves pricing and does not claim a status for it', async () => {
    const { supabase } = client({})
    const live = await getLiveData(supabase)
    expect(live.pricing).toEqual({})
    // getLivePricing catches its own failures and returns {}, so `{}` here could mean
    // "no offerings" or "the read broke" and this boundary cannot tell. Adding a
    // `status.pricing` would re-create the exact lie the map exists to remove.
    expect(Object.keys(live.status)).not.toContain('pricing')
  })
})
