import { describe, it, expect } from 'vitest'
import Image, { alt, size, contentType } from './opengraph-image'
import * as twitter from './twitter-image'
import { OG_CONTENT_TYPE } from '@/lib/og/content-type'

// ── LIVE-183 · one card per article, proven by rendering them ────────────────────────────────────
//
// 🔴 THE DEFECT. `app/(help)/opengraph-image.tsx` is a ROUTE-GROUP file that takes no params, so
// every help URL — all 57 articles, 10 category indexes, /help/changelog — previewed as the same
// picture. A test that merely asserts this file exists would pass against a card that ignores its
// params and draws the identical bytes 57 times, which is the same defect with a green suite. So
// the assertion below is on the BYTES: two different articles must not rasterise to the same image.
//
// Watch it fail: replace `heading` in opengraph-image.tsx with a constant (or drop the `params`
// read) and "two different articles draw two different cards" goes red while everything else stays
// green.
//
// These run the REAL route: the real content read off disk, the real Nunito faces, the real Satori
// render and the real sharp re-encode. Slow on purpose — a card that throws in production throws
// here.

const render = async (category: string, slug: string) => {
  const res = await Image({ params: Promise.resolve({ category, slug }) })
  return { res, body: Buffer.from(await res.arrayBuffer()) }
}

const JPEG_SOI = Buffer.from([0xff, 0xd8, 0xff])

describe('the per-article help card', () => {
  it('renders a real article as a cacheable JPEG', async () => {
    const { res, body } = await render('getting-started', 'join-a-circle')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(OG_CONTENT_TYPE)
    // Not a raw PNG served under a jpeg tag: deliverCard is fail-safe and would swallow a failed
    // sharp import silently, turning ~151KB into ~1.7MB.
    expect(body.subarray(0, 3)).toEqual(JPEG_SOI)
    expect(body.byteLength).toBeGreaterThan(10_000)
    const cc = res.headers.get('cache-control') ?? ''
    expect(cc).toContain('s-maxage=')
    expect(cc).toContain('stale-while-revalidate=')
  }, 120_000)

  it('draws two different articles as two different cards', async () => {
    // THE ROW, in one assertion. Before this route existed both of these URLs resolved to the
    // group card and these two buffers were byte-identical.
    const [a, b] = await Promise.all([
      render('getting-started', 'join-a-circle'),
      render('the-quest', 'streaks'),
    ])
    expect(a.body.equals(b.body)).toBe(false)
  }, 120_000)

  it('answers an unknown slug with the fallback card rather than throwing', async () => {
    // The fallback is allowed to look like the group card — that is the point — so what is pinned
    // here is that it EXISTS: a card that threw on a bad slug would end a production export
    // (LIVE-084), and the page's own 404 must stay the page's job.
    const { res, body } = await render('getting-started', 'no-such-article')
    expect(res.status).toBe(200)
    expect(body.subarray(0, 3)).toEqual(JPEG_SOI)
  }, 120_000)
})

describe('the route declares what the guards read', () => {
  it('exports the shared MIME constant and a usable size', () => {
    expect(contentType).toBe(OG_CONTENT_TYPE)
    expect(size).toEqual({ width: 1200, height: 630 })
    expect(alt).toMatch(/help article/i)
  })

  it('the twitter card is the SAME card, not the group card', () => {
    // Without a twitter-image at this segment Next keeps the group card for twitter:image while
    // og:image becomes the article's — half a fix, and invisible outside X and Slack.
    expect(twitter.default).toBe(Image)
    expect(twitter.contentType).toBe(contentType)
    expect(twitter.size).toEqual(size)
  })
})
