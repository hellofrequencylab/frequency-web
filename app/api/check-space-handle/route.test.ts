import { beforeEach, describe, expect, it, vi } from 'vitest'

// GET /api/check-space-handle through the real route. The doubles are the two edges: the rate limiter's Redis and
// the Spaces table read (isSpaceSlugTaken). The route's rules (the handle shape, the three words, a failed read is
// never "free") are the real ones.

let allowed = true
let taken: boolean | null | 'throws' = false
const asked: string[] = []

vi.mock('@/lib/rate-limit', () => ({
  rateLimitOk: async () => allowed,
  clientIp: () => '203.0.113.7',
  tooMany: () => new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 }),
}))
vi.mock('@/lib/spaces/store', () => ({
  isSpaceSlugTaken: async (slug: string) => {
    asked.push(slug)
    if (taken === 'throws') throw new Error('db down')
    return taken
  },
}))

import { GET } from '@/app/api/check-space-handle/route'

const ask = async (handle?: string) => {
  const res = await GET(new Request(`https://example.test/api/check-space-handle${handle === undefined ? '' : `?handle=${encodeURIComponent(handle)}`}`))
  return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') }
}

beforeEach(() => {
  allowed = true
  taken = false
  asked.length = 0
})

describe('GET /api/check-space-handle', () => {
  it('says free for a handle no Space holds', async () => {
    expect(await ask('saltwater')).toEqual({ status: 200, body: { status: 'free' }, cache: 'no-store' })
    expect(asked).toEqual(['saltwater'])
  })

  it('says taken, and nothing about who holds it', async () => {
    taken = true
    const res = await ask('Saltwater')
    expect(res.body).toEqual({ status: 'taken' })
    expect(asked).toEqual(['saltwater'])
  })

  it('says invalid for anything that is not a handle, without touching the table', async () => {
    for (const bad of [undefined, '', 'a', '-x', 'x-', 'a--b', 'has space', 'a/b', 'x'.repeat(41), "x'; drop table spaces;--"]) {
      expect((await ask(bad)).body).toEqual({ status: 'invalid' })
    }
    expect(asked).toEqual([])
  })

  it('never says free when the read failed', async () => {
    taken = null
    const failed = await ask('saltwater')
    expect(failed.status).toBe(503)
    expect(failed.body).toEqual({ error: 'unavailable' })
    taken = 'throws'
    const threw = await ask('saltwater')
    expect(threw.status).toBe(503)
    expect(JSON.stringify(threw.body)).not.toContain('free')
  })

  it('is rate limited before it reads anything', async () => {
    allowed = false
    const res = await ask('saltwater')
    expect(res.status).toBe(429)
    expect(asked).toEqual([])
  })

  it('only ever answers with one of three words', async () => {
    for (const t of [true, false]) {
      taken = t
      expect(['free', 'taken']).toContain((await ask('river-studio')).body.status)
    }
  })
})
