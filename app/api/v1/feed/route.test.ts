import { beforeEach, describe, expect, it, vi } from 'vitest'
import { feedResponse, postCreateResponse, reactionResponse } from '@/lib/contract'

// /api/v1/feed (LIVE-716): the page reader, the post write and the reaction toggle, each the web's.

let authOk = true
const loadFeedPage = vi.fn()
const createPost = vi.fn()
const toggleReaction = vi.fn()

vi.mock('@/lib/contract/caller', () => ({
  authorizeCaller: async () =>
    authOk ? { ok: true, via: 'bearer', caller: { id: 'p-1' }, profile: {} } : { ok: false, code: 'unauthorized', message: 'Sign in again.' },
  asCaller: (_auth: unknown, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/rate-limit', () => ({ clientIp: () => '203.0.113.9', rateLimitOk: async () => true }))
vi.mock('@/lib/feed/feed-page', () => ({ loadFeedPage }))
vi.mock('@/app/(main)/feed/actions', () => ({ createPost, toggleReaction }))

const POST_ID = '4b3f1c2e-8d7a-4c1b-9e2f-1a2b3c4d5e6f'
const row = {
  id: POST_ID,
  body: 'hi',
  post_type: 'feed',
  is_pinned: false,
  created_at: '2026-10-06T00:00:00Z',
  media_urls: null,
  reaction_count: 2,
  comment_count: 1,
  engagement_score: 3,
  scope_id: null,
  visibility: 'public',
  author: { id: 'a-1', display_name: 'Ana', handle: 'ana', avatar_url: null },
  reactions: [
    { id: 'r1', reaction_type: 'heart', profile_id: 'p-1' },
    { id: 'r2', reaction_type: 'fire', profile_id: 'other' },
  ],
}

beforeEach(() => {
  authOk = true
  loadFeedPage.mockReset().mockResolvedValue({ kind: 'ok', items: [row] })
  createPost.mockReset().mockResolvedValue({ data: undefined })
  toggleReaction.mockReset().mockResolvedValue({ data: { active: true, count: 3 } })
})

describe('GET /api/v1/feed', () => {
  it('pages the feed for the caller, with only the caller\'s own reactions', async () => {
    const { GET } = await import('./route')
    const json = await (await GET(new Request('https://frequencylocal.com/api/v1/feed?sort=recent'))).json()
    expect(feedResponse.safeParse(json).success).toBe(true)
    expect(json.data.items[0]).toMatchObject({ id: POST_ID, myReactions: ['heart'], mediaUrls: [], author: { handle: 'ana' } })
    expect(json.data.nextCursor).toBeNull()
    expect(loadFeedPage).toHaveBeenCalledWith({ profileId: 'p-1', sort: 'recent', scopeId: null })
  })

  it('is internal when the feed RPC failed, never an empty page', async () => {
    loadFeedPage.mockResolvedValue({ kind: 'error' })
    const { GET } = await import('./route')
    expect((await GET(new Request('https://frequencylocal.com/api/v1/feed'))).status).toBe(500)
  })

  it('is a 401 signed out', async () => {
    authOk = false
    const { GET } = await import('./route')
    expect((await GET(new Request('https://frequencylocal.com/api/v1/feed'))).status).toBe(401)
    expect(loadFeedPage).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/feed/posts', () => {
  it('posts through createPost with the composer\'s fields', async () => {
    const { POST } = await import('./posts/route')
    const res = await POST(
      new Request('https://x/api/v1/feed/posts', { method: 'POST', body: JSON.stringify({ body: 'hello', scopeId: POST_ID }) }),
    )
    expect(res.status).toBe(201)
    expect(postCreateResponse.safeParse(await res.json()).success).toBe(true)
    const form = createPost.mock.calls[0][0] as FormData
    expect([form.get('body'), form.get('scopeId'), form.get('visibility'), form.get('post_type')]).toEqual(['hello', POST_ID, 'public', 'feed'])
  })

  it('passes a refusal through as forbidden', async () => {
    createPost.mockResolvedValue({ error: 'Only hosts can post an announcement.' })
    const { POST } = await import('./posts/route')
    const res = await POST(
      new Request('https://x/api', { method: 'POST', body: JSON.stringify({ body: 'x', scopeId: POST_ID, postType: 'announcement' }) }),
    )
    expect(res.status).toBe(403)
  })
})

describe('POST /api/v1/feed/posts/{id}/reactions', () => {
  it('toggles the caller\'s reaction', async () => {
    const { POST } = await import('./posts/[id]/reactions/route')
    const res = await POST(
      new Request('https://x/api', { method: 'POST', body: JSON.stringify({ reaction: 'heart', active: true }) }),
      { params: Promise.resolve({ id: POST_ID }) },
    )
    const json = await res.json()
    expect(reactionResponse.safeParse(json).success).toBe(true)
    expect(toggleReaction).toHaveBeenCalledWith(POST_ID, 'heart', true)
  })

  it('refuses an unknown reaction', async () => {
    toggleReaction.mockResolvedValue({ error: 'Unknown reaction' })
    const { POST } = await import('./posts/[id]/reactions/route')
    const res = await POST(
      new Request('https://x/api', { method: 'POST', body: JSON.stringify({ reaction: 'nope', active: true }) }),
      { params: Promise.resolve({ id: POST_ID }) },
    )
    expect(res.status).toBe(400)
  })
})
