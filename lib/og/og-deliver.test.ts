import { describe, it, expect } from 'vitest'
import { readFileSync, globSync } from 'node:fs'
import { claimCardResponse } from './claim-card'
import { OG_CONTENT_TYPE } from './deliver'

// ── A share card that is too big to arrive is a share card that does not exist ─────────────
//
// 🔴 THE BUG. next/og rasterises through Satori + resvg and emits LOSSLESS PNG only. Our claim,
// Space and event cards all put a PHOTOGRAPH across the full 1200x630 canvas, and a photograph
// encoded losslessly is ~1.7MB — 6 to 18 times a normal OG card. It also carried
// `max-age=0, must-revalidate`, so every previewer paid a fresh ~600ms render AND a fresh 1.7MB
// transfer, with nothing reused between the crawler, the mail client and the recipient.
//
// Reported four times as "the mail preview card still isn't working" while iMessage rendered the
// same link fine. Every earlier fix targeted the TAGS, which were never wrong.
//
// ⚠️ These assertions measure BYTES, not mail clients. Whether Apple Mail's specific threshold was
// the payload is inferred from the iMessage/Mail split and cannot be verified in CI. The size and
// the missing cache are defects on their own terms.

describe('the claim card is small enough to preview', () => {
  it('renders a real photographic cover under 400KB', async () => {
    const res = await claimCardResponse({
      name: 'Breathe & Shine',
      pill: 'Business',
      noun: 'business',
      placeholderRelPath: '/images/site/community-dinner.jpg',
      accent: '#1EB6C5',
    })
    const bytes = Buffer.from(await res.arrayBuffer())
    // Measured: 1,776KB as PNG, 151KB as JPEG q=85. The ceiling sits between the two, well clear of
    // the real number, so it fails loudly if anyone reverts to PNG and does not nag on a re-tune.
    expect(bytes.byteLength).toBeLessThan(400_000)
    // JPEG magic (FFD8FF). A PNG here means the sharp fallback silently took over.
    expect(bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff')
    expect(res.headers.get('content-type')).toBe('image/jpeg')
  }, 120_000)

  it('is cacheable, so the render happens once and not once per scrape', async () => {
    const res = await claimCardResponse({
      name: 'Breathe & Shine',
      pill: 'Business',
      noun: 'business',
      placeholderRelPath: '/images/site/community-dinner.jpg',
      accent: '#1EB6C5',
    })
    const cc = res.headers.get('cache-control') ?? ''
    // 🔴 The shipped value was `public, max-age=0, must-revalidate` — the default for a route that
    // reads params and uncached data, and the reason every preview paid full price.
    expect(cc).not.toContain('max-age=0')
    expect(cc).not.toContain('must-revalidate')
    expect(cc).toContain('s-maxage=')
    expect(cc).toContain('stale-while-revalidate=')
  }, 120_000)
})

describe('every route declares the bytes it actually serves', () => {
  // EVERY opengraph-image route, discovered from disk rather than listed. A new card added next
  // month would otherwise ship as an unguarded 1.7MB PNG and nothing here would notice.
  const ROUTES = globSync('app/**/opengraph-image.tsx').sort()

  it('found them all, so an empty glob cannot pass this suite vacuously', () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(14)
  })

  it('the shared MIME constant is jpeg', () => {
    expect(OG_CONTENT_TYPE).toBe('image/jpeg')
  })

  it.each(ROUTES)('%s exports contentType from the constant, not a literal', (path) => {
    // A hardcoded 'image/png' beside JPEG bytes makes og:image:type a lie, and some previewers
    // trust the tag over sniffing.
    const src = readFileSync(path, 'utf8')
    expect(src).toContain('export const contentType = OG_CONTENT_TYPE')
    expect(src).not.toContain("export const contentType = 'image/png'")
  })

  it.each(ROUTES)('%s runs on the nodejs runtime, which sharp requires', (path) => {
    // 🔴 SILENT IF MISSED. sharp is a native binary and cannot load on the edge runtime. deliverCard
    // is fail-safe, so an edge route would not error — it would quietly serve the original 1.7MB PNG
    // under a jpeg contentType. That is this exact bug coming back with a green test suite, which is
    // how it survived three rounds of fixes. All 14 routes are nodejs today; this makes it a rule.
    const src = readFileSync(path, 'utf8')
    expect(src).toMatch(/export const runtime = ['"]nodejs['"]/)
  })

  it.each(ROUTES)('%s has no un-delivered ImageResponse left on any branch', (path) => {
    // 🔴 Both entity cards have TWO return sites: a fallback branch and the main card. contentType
    // is one export for the whole route, so converting only the main path leaves the fallback
    // serving PNG bytes under a jpeg tag.
    const src = readFileSync(path, 'utf8')
    expect(src).not.toContain('new ImageResponse(')
  })
})
