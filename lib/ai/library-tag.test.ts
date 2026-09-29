import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// LIVE-587 (ADR-1589): Vera names a Loom image nobody named. What is pinned here: the reply is
// re-validated before it can reach a row (tags cleaned and capped, the vera tag reserved for the
// write, em dashes gone, a category only from the Space's own list); only a Loom raster the API can
// take is ever sent; the AI gates refuse BEFORE any fetch or model call, and say `unavailable` so a
// sweep stops; the image really goes as an image block. No live model call anywhere.

const state = vi.hoisted(() => ({
  available: true,
  over: false,
  limited: false,
  calls: [] as Record<string, unknown>[],
  reply: { alt: 'A dog on a beach.', tags: ['dog', 'beach'], category: 'Animals' } as unknown,
}))

vi.mock('./usage', () => ({
  aiAvailable: vi.fn(async () => state.available),
  featureOverBudget: vi.fn(async () => state.over),
  recordAiUsage: vi.fn(async () => {}),
}))
vi.mock('./rate-limit', () => ({ aiRateLimited: vi.fn(async () => state.limited) }))
vi.mock('./complete', () => ({
  completeRaw: vi.fn(async (p: Record<string, unknown>) => {
    state.calls.push(p)
    return {
      tier: 'haiku',
      model: 'test-model',
      content: [{ type: 'tool_use', id: 't1', name: 'name_image', input: state.reply }],
      text: '',
      usage: { inputTokens: 1, outputTokens: 1 },
      costUsd: 0,
    }
  }),
}))

import { coerceLibraryTagging, describeLibraryImage, isTaggableImage, MAX_TAG_IMAGE_BYTES, MAX_VERA_TAGS } from './library-tag'

const LOOM = 'https://abc.supabase.co/storage/v1/object/public/library-media/space/1.jpg'

describe('coerceLibraryTagging (the reply is never trusted)', () => {
  it('cleans, de-duplicates and caps the tags, and reserves the vera tag for the write', () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag ${i}`)
    const out = coerceLibraryTagging({ tags: ['  Sunset!! ', 'sunset', 'vera', '#Beach', 'x', 42, ...many] }, [])
    expect(out.tags.slice(0, 2)).toEqual(['sunset', 'beach'])
    expect(out.tags).not.toContain('vera')
    expect(out.tags).not.toContain('x')
    expect(out.tags).toHaveLength(MAX_VERA_TAGS)
  })

  it('strips em dashes from the alt, caps it, and turns an empty one into null', () => {
    expect(coerceLibraryTagging({ alt: 'A lake — at dawn' }, []).alt).toBe('A lake, at dawn')
    expect(coerceLibraryTagging({ alt: 'x'.repeat(400) }, []).alt).toHaveLength(240)
    expect(coerceLibraryTagging({ alt: '   ' }, []).alt).toBeNull()
    expect(coerceLibraryTagging({ alt: 7 }, []).alt).toBeNull()
  })

  it('keeps a category only when the Space already uses it, in the Space spelling', () => {
    expect(coerceLibraryTagging({ category: 'animals' }, ['Animals', 'Food']).category).toBe('Animals')
    expect(coerceLibraryTagging({ category: 'Invented' }, ['Animals']).category).toBeNull()
    expect(coerceLibraryTagging({ category: 'Animals' }, []).category).toBeNull()
  })

  it('survives a reply that is not an object at all', () => {
    expect(coerceLibraryTagging(null, ['A'])).toEqual({ alt: null, tags: [], category: null })
  })
})

describe('isTaggableImage (only a Loom raster the API can take is sent)', () => {
  it('takes a Loom Storage jpeg/png/webp/gif under the ceiling', () => {
    expect(isTaggableImage({ url: LOOM, mime: 'image/jpeg', bytes: 1000 })).toBe(true)
    expect(isTaggableImage({ url: LOOM, mime: 'image/png', bytes: null })).toBe(true)
  })
  it('refuses a vector, an unsupported type, an oversize file and a foreign host', () => {
    expect(isTaggableImage({ url: LOOM.replace('.jpg', '.svg'), mime: 'image/svg+xml' })).toBe(false)
    expect(isTaggableImage({ url: LOOM, mime: 'image/heic' })).toBe(false)
    expect(isTaggableImage({ url: LOOM, mime: 'image/jpeg', bytes: MAX_TAG_IMAGE_BYTES + 1 })).toBe(false)
    expect(isTaggableImage({ url: 'https://evil.example/x.jpg', mime: 'image/jpeg' })).toBe(false)
    expect(isTaggableImage({ url: null, mime: 'image/jpeg' })).toBe(false)
  })
})

describe('describeLibraryImage (the door)', () => {
  const fetchMock = vi.fn(
    async () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { 'content-type': 'image/jpeg' } }),
  )

  beforeEach(() => {
    state.available = true
    state.over = false
    state.limited = false
    state.calls.length = 0
    state.reply = { alt: 'A dog on a beach.', tags: ['dog', 'beach'], category: 'animals' }
    fetchMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the image as a base64 image block on the haiku tier and returns the validated proposal', async () => {
    const res = await describeLibraryImage(LOOM, 'image/jpeg', { categories: ['Animals'], actorId: 'p1' })
    expect(res).toEqual({ ok: true, tagging: { alt: 'A dog on a beach.', tags: ['dog', 'beach'], category: 'Animals' } })
    expect(state.calls).toHaveLength(1)
    const call = state.calls[0]
    expect(call.tier).toBe('haiku')
    const content = (call.messages as Array<{ content: Array<Record<string, unknown>> }>)[0].content
    expect(content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AQIDBA==' } })
    expect(String(content[1].text)).toContain('Animals')
  })

  it.each([
    ['AI is off', () => { state.available = false }],
    ['the daily cap is spent', () => { state.over = true }],
    ['the actor is throttled', () => { state.limited = true }],
  ])('answers unavailable with no fetch and no model call when %s', async (_why, set) => {
    set()
    expect(await describeLibraryImage(LOOM, 'image/jpeg', { actorId: 'p1' })).toEqual({ ok: false, reason: 'unavailable' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(state.calls).toHaveLength(0)
  })

  it('fails one image (so a sweep moves on) when it cannot be fetched, without a model call', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }))
    expect(await describeLibraryImage(LOOM, 'image/jpeg')).toEqual({ ok: false, reason: 'failed' })
    expect(state.calls).toHaveLength(0)
  })

  it('never sends a vector or a foreign URL', async () => {
    expect(await describeLibraryImage(LOOM.replace('.jpg', '.svg'), 'image/svg+xml')).toEqual({ ok: false, reason: 'failed' })
    expect(await describeLibraryImage('https://evil.example/x.jpg', 'image/jpeg')).toEqual({ ok: false, reason: 'failed' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails a reply with neither alt nor tags rather than writing nothing as something', async () => {
    state.reply = { alt: '', tags: [] }
    expect(await describeLibraryImage(LOOM, 'image/jpeg')).toEqual({ ok: false, reason: 'failed' })
  })
})
