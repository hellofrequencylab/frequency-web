import { describe, it, expect, vi, beforeEach } from 'vitest'

// Space CONTENT readers (Puck content blocks, Phase 2). These are the RSC/live-data path the dynamic
// Space blocks read through. The contract we lock: FAIL-SAFE to empty on any error or missing table
// (a brand-new Space, or pre-migration), and the reviews summary derives the average + count purely
// from the rows. We drive the admin client through a mock so no real IO happens.

// A tiny chainable query builder the reader's untyped().from(...).select(...).eq(...)... calls resolve
// against. `result` is the terminal { data } the final .limit(n) returns. When `throwAt` is set, the
// builder throws to prove the try/catch fail-safe.
function makeAdmin(result: { data: unknown[] | null }, opts: { throws?: boolean } = {}) {
  const terminal = {
    limit: async () => {
      if (opts.throws) throw new Error('boom')
      return result
    },
  }
  const afterEq = {
    eq: () => ({ order: () => terminal }),
    order: () => terminal,
  }
  const chain = {
    select: () => ({ eq: () => afterEq }),
  }
  return { from: () => chain }
}

let currentAdmin: ReturnType<typeof makeAdmin>
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => currentAdmin }))

// The live SpacePractices / SpaceCommunity readers reuse the existing space readers; mock those so
// the shaping logic (kind, slug fallback, positive-adopt gate, active-only filter) is exercised
// without touching the DB.
const listPracticesForSpace = vi.fn()
const listJourneyPlansForSpace = vi.fn()
const listCirclesForSpace = vi.fn()
vi.mock('@/lib/practices', () => ({ listPracticesForSpace: (...a: unknown[]) => listPracticesForSpace(...a) }))
vi.mock('@/lib/journey-plans', () => ({ listJourneyPlansForSpace: (...a: unknown[]) => listJourneyPlansForSpace(...a) }))
vi.mock('@/lib/circles/store', () => ({ listCirclesForSpace: (...a: unknown[]) => listCirclesForSpace(...a) }))

import {
  getSpaceUpdates,
  getSpaceReviews,
  getSpaceFaqs,
  getSpaceContentData,
  getSpaceSectionPresence,
  getSpacePractices,
  getSpaceCommunity,
  getSpaceCommunityFeed,
} from './content-data'

beforeEach(() => {
  currentAdmin = makeAdmin({ data: [] })
  listPracticesForSpace.mockReset().mockResolvedValue([])
  listJourneyPlansForSpace.mockReset().mockResolvedValue([])
  listCirclesForSpace.mockReset().mockResolvedValue([])
})

describe('getSpaceUpdates', () => {
  it('maps published rows to the block shape', async () => {
    currentAdmin = makeAdmin({
      data: [
        { id: 'u1', title: 'Hello', body: 'Body', image_url: 'https://x/y.jpg', published_at: '2026-01-01', post_id: 'p1' },
        { id: 'u2', title: '', body: 'Just body', image_url: null, published_at: null, post_id: null },
      ],
    })
    const out = await getSpaceUpdates('space-1')
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ id: 'u1', title: 'Hello', body: 'Body', imageUrl: 'https://x/y.jpg', publishedAt: '2026-01-01', postId: 'p1' })
    expect(out[1].imageUrl).toBeNull()
    expect(out[1].postId).toBeNull()
  })

  it('fails safe to [] when the query throws', async () => {
    currentAdmin = makeAdmin({ data: null }, { throws: true })
    expect(await getSpaceUpdates('space-1')).toEqual([])
  })

  it('fails safe to [] when there are no rows', async () => {
    currentAdmin = makeAdmin({ data: null })
    expect(await getSpaceUpdates('space-1')).toEqual([])
  })
})

describe('getSpaceReviews', () => {
  it('derives the average (one decimal) and count from visible rows', async () => {
    currentAdmin = makeAdmin({
      data: [
        { id: 'r1', rating: 5, body: 'Great', created_at: '2026-01-02', author: { display_name: 'Ana', avatar_url: null } },
        { id: 'r2', rating: 4, body: 'Good', created_at: '2026-01-01', author: null },
      ],
    })
    const out = await getSpaceReviews('space-1')
    expect(out.count).toBe(2)
    expect(out.average).toBe(4.5)
    expect(out.latest[0].author?.displayName).toBe('Ana')
    expect(out.latest[1].author).toBeNull()
  })

  it('rounds the average to one decimal', async () => {
    currentAdmin = makeAdmin({
      data: [
        { id: 'a', rating: 5, body: '', created_at: '', author: null },
        { id: 'b', rating: 4, body: '', created_at: '', author: null },
        { id: 'c', rating: 4, body: '', created_at: '', author: null },
      ],
    })
    const out = await getSpaceReviews('space-1')
    expect(out.average).toBe(4.3) // 13/3 = 4.333 -> 4.3
  })

  it('fails safe to an empty summary (null average, 0 count) when there are no rows', async () => {
    currentAdmin = makeAdmin({ data: [] })
    expect(await getSpaceReviews('space-1')).toEqual({ average: null, count: 0, latest: [] })
  })

  it('fails safe to an empty summary when the query throws', async () => {
    currentAdmin = makeAdmin({ data: null }, { throws: true })
    expect(await getSpaceReviews('space-1')).toEqual({ average: null, count: 0, latest: [] })
  })
})

describe('getSpaceFaqs', () => {
  it('maps rows to the block shape', async () => {
    currentAdmin = makeAdmin({
      data: [
        { id: 'f1', question: 'How?', answer: 'Like this.', position: 0 },
        { id: 'f2', question: 'When?', answer: 'Now.', position: 1 },
      ],
    })
    const out = await getSpaceFaqs('space-1')
    expect(out).toEqual([
      { id: 'f1', question: 'How?', answer: 'Like this.' },
      { id: 'f2', question: 'When?', answer: 'Now.' },
    ])
  })

  it('fails safe to [] when the query throws', async () => {
    currentAdmin = makeAdmin({ data: null }, { throws: true })
    expect(await getSpaceFaqs('space-1')).toEqual([])
  })
})

describe('getSpaceContentData', () => {
  it('assembles all three reads and carries the space id, fail-safe to empty', async () => {
    currentAdmin = makeAdmin({ data: [] })
    const out = await getSpaceContentData('space-9')
    expect(out.spaceId).toBe('space-9')
    expect(out.updates).toEqual([])
    expect(out.reviews).toEqual({ average: null, count: 0, latest: [] })
    expect(out.faqs).toEqual([])
  })

  it('runs the live reads even without an input (staff preview + the anchor menu share one data path)', async () => {
    await getSpaceContentData('space-10')
    expect(listPracticesForSpace).toHaveBeenCalled()
    expect(listCirclesForSpace).toHaveBeenCalled()
  })
})

describe('getSpaceSectionPresence', () => {
  it('reports which live sections have rows, fail-safe false elsewhere', async () => {
    listCirclesForSpace.mockResolvedValue([
      { id: 'c1', slug: 'c', name: 'Circle', about: null, member_count: 2, status: 'active' },
    ])
    const p = await getSpaceSectionPresence('space-11', null)
    expect(p.community).toBe(true)
    expect(p.practices).toBe(false)
    expect(p.reviews).toBe(false)
    expect(p.faqs).toBe(false)
    expect(p.updates).toBe(false)
    // No published availability + no slug: the booking anchor never shows.
    expect(p.booking).toBe(false)
  })
})

describe('getSpacePractices', () => {
  it('shapes practices + journeys, falling back a null practice slug to its id and gating adopt count', async () => {
    listPracticesForSpace.mockResolvedValue([
      { id: 'p1', slug: 'breath', title: 'Breath', summary: 'Calm', description: null, icon: '🌬️' },
      { id: 'p2', slug: null, title: 'Sit', summary: null, description: 'Just sit', icon: null },
    ])
    listJourneyPlansForSpace.mockResolvedValue([
      { id: 'j1', slug: 'reset', title: 'Reset', summary: 'A week', emoji: '🧭', adopt_count: 3 },
      { id: 'j2', slug: 'grow', title: 'Grow', summary: null, emoji: null, adopt_count: 0 },
    ])
    const out = await getSpacePractices('space-1')
    expect(out.practices).toEqual([
      { kind: 'practice', id: 'p1', slug: 'breath', title: 'Breath', summary: 'Calm', emoji: '🌬️', adoptCount: 0 },
      { kind: 'practice', id: 'p2', slug: 'p2', title: 'Sit', summary: 'Just sit', emoji: null, adoptCount: 0 },
    ])
    expect(out.journeys[0]).toEqual({ kind: 'journey', id: 'j1', slug: 'reset', title: 'Reset', summary: 'A week', emoji: '🧭', adoptCount: 3 })
    expect(out.journeys[1].adoptCount).toBe(0)
  })

  it('fails safe to empty groups when a reader throws', async () => {
    listPracticesForSpace.mockRejectedValue(new Error('boom'))
    expect(await getSpacePractices('space-1')).toEqual({ practices: [], journeys: [] })
  })
})

describe('getSpaceCommunity', () => {
  it('keeps only active circles and shapes them (member count defaulted)', async () => {
    listCirclesForSpace.mockResolvedValue([
      { id: 'c1', slug: 'a', name: 'Alpha', about: 'About A', status: 'active', member_count: 5 },
      { id: 'c2', slug: 'b', name: 'Beta', about: null, status: 'archived', member_count: 2 },
      { id: 'c3', slug: 'c', name: 'Gamma', about: null, status: 'active', member_count: null },
    ])
    const out = await getSpaceCommunity('space-1')
    expect(out).toEqual([
      { id: 'c1', slug: 'a', name: 'Alpha', about: 'About A', memberCount: 5 },
      { id: 'c3', slug: 'c', name: 'Gamma', about: null, memberCount: 0 },
    ])
  })

  it('fails safe to [] when the reader throws', async () => {
    listCirclesForSpace.mockRejectedValue(new Error('boom'))
    expect(await getSpaceCommunity('space-1')).toEqual([])
  })
})

describe('getSpaceCommunityFeed', () => {
  it('returns a post per update with empty interaction when an update has no anchor', async () => {
    currentAdmin = makeAdmin({
      data: [{ id: 'u1', title: 'Hi', body: 'B', image_url: null, published_at: '2026-01-01', post_id: null }],
    })
    const feed = await getSpaceCommunityFeed('space-1', 'viewer-1')
    expect(feed.posts).toHaveLength(1)
    expect(feed.posts[0].anchorId).toBeNull()
    expect(feed.posts[0].reactions).toEqual({ counts: {}, mine: [] })
    expect(feed.posts[0].comments).toEqual([])
  })

  it('fails safe to no posts when the updates read throws', async () => {
    currentAdmin = makeAdmin({ data: [] }, { throws: true })
    const feed = await getSpaceCommunityFeed('space-1', null)
    expect(feed.posts).toEqual([])
  })
})
