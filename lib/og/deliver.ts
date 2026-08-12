import type { ImageResponse, ImageResponse as ImageResponseCtor } from 'next/og'

// ── Getting a share card SMALL ENOUGH and CACHED, or it never reaches a mail client ────────
//
// 🔴 THE BUG THIS EXISTS FOR, measured on the real Breathe & Shine claim card:
//
//     PNG (what we shipped)   1,776 KB     re-rendered on EVERY fetch (~500-760ms)
//     JPEG q=85 (this file)     151 KB     rendered once, then served from the CDN
//
// `next/og` rasterises through Satori + resvg and emits **lossless PNG only**. That is fine for a
// flat card and catastrophic for ours: the claim, Space and event cards all put a PHOTOGRAPH across
// the full 1200x630 canvas, and a photograph encoded losslessly is ~1.7MB. A typical OG card is
// 100-300KB. We were shipping 6-18x that on the one link a business owner opens from an email.
//
// It also carried `cache-control: public, max-age=0, must-revalidate` — the default for a route that
// reads request params and uncached data — so every previewer paid a fresh render AND a fresh 1.7MB
// transfer. Nothing was ever reused between the mail client, the crawler and the recipient.
//
// ⚠️ WHAT IS PROVEN AND WHAT IS NOT. The sizes and timings above are measured (lib/og/og-deliver.test.ts
// re-measures them on every run). That Apple Mail's LinkPresentation specifically rejected the card
// on payload grounds is INFERRED, not proven: the observed split was that iMessage rendered the card
// and Mail fell back to title + favicon, and Mail's preview budget is the shorter of the two. It
// could not be verified from CI — the egress proxy denies frequencylocal.com by policy, and there is
// no mail client here. Both defects above are real and worth fixing on their own terms regardless of
// which one Mail was tripping on.

/** JPEG quality. 85 is the knee of the curve on these cards: q=92 costs 212KB, q=80 saves only 23KB
 *  more and starts showing ringing on the scrim gradient behind the lockup. */
const QUALITY = 85

// The MIME lives in its own leaf module (./content-type) and is re-exported here so existing
// callers keep working. ⚠️ A ROUTE'S `contentType` EXPORT MUST IMPORT IT FROM './content-type',
// NOT FROM HERE — importing it from this file pulls this whole module, and therefore sharp, into
// the importer's bundle. For the root `app/opengraph-image.tsx` that means into every page in the
// app. See lib/og/content-type.ts for the full account, and `pnpm check:og-trace` for the guard.
export { OG_CONTENT_TYPE } from './content-type'
import { OG_CONTENT_TYPE } from './content-type'

/**
 * Cache posture. A card is a pure function of the entity's identity, so it is safe to reuse, but it
 * is NOT immutable: an owner who changes their cover or brand name should see the card follow within
 * a reasonable window.
 *
 * - `max-age=3600` — a client that just fetched it does not refetch on a retry.
 * - `s-maxage=86400` — the CDN serves it for a day, so the render happens once, not once per scrape.
 * - `stale-while-revalidate=604800` — a week of instant stale hits while one background render
 *   refreshes. This is what makes a cold link fast for the SECOND previewer and every one after.
 */
const CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'

/**
 * Take the PNG an `ImageResponse` produced and deliver it as a compressed, cacheable JPEG.
 *
 * ⚠️ FAIL-SAFE, deliberately. If sharp is unavailable or the re-encode throws, this returns the
 * ORIGINAL PNG with the same cache headers rather than failing the route. A heavy card still
 * previews on most clients; a 500 previews on none. The one thing it must never do is throw, because
 * an OG route that throws is a card nobody sees.
 */
export async function deliverCard(image: ImageResponse): Promise<Response> {
  const png = Buffer.from(await image.arrayBuffer())
  try {
    // ⚠️ THE LAZY IMPORT IS NOT WHAT KEEPS SHARP OUT OF OTHER ROUTES — it never was, despite what
    // the comment here used to claim ("so the module graph does not pull a native binary into every
    // route that merely imports this file's constants"). The intent was right and the mechanism did
    // nothing: @vercel/nft reads the literal specifier straight back out of the emitted chunk, so
    // sharp — and the 17.7MB `libvips-cpp.so` behind it — is traced into EVERY function whose
    // bundle contains this module. Both ways of hiding it were tried and MEASURED to fail:
    // `turbopackIgnore` leaves the literal in place for nft to find, and assembling the specifier
    // at runtime is constant-folded back to `"sharp"` by the minifier.
    //
    // What actually bounds the blast radius is the MODULE BOUNDARY: bundling is per module, not
    // per export, so nothing that merely declares a MIME type may import this file. That is why
    // `OG_CONTENT_TYPE` lives in ./content-type — see the comment block there for what it cost.
    // `pnpm check:og-trace` is the guard that keeps it true.
    const { default: sharp } = await import('sharp')
    const jpeg = await sharp(png).jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer()
    return new Response(new Uint8Array(jpeg), {
      headers: { 'Content-Type': OG_CONTENT_TYPE, 'Cache-Control': CACHE_CONTROL },
    })
  } catch {
    return new Response(new Uint8Array(png), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': CACHE_CONTROL },
    })
  }
}

/**
 * Build an `ImageResponse` and deliver it through `deliverCard` in one call.
 *
 * Takes the SAME two arguments as `new ImageResponse(...)`, so a route converts by swapping the
 * constructor for this function and nothing else — no re-indenting a 90-line JSX tree, which is how
 * a conversion like this usually introduces an unrelated diff.
 *
 * ⚠️ EVERY return path in a route must use it. `contentType` is one export for the whole route, so a
 * route that delivers JPEG on the main path and a raw PNG `ImageResponse` on its fallback branch is
 * serving bytes that contradict its own `og:image:type`.
 */
export async function cardResponse(
  element: ConstructorParameters<typeof ImageResponseCtor>[0],
  options: ConstructorParameters<typeof ImageResponseCtor>[1],
): Promise<Response> {
  const { ImageResponse } = await import('next/og')
  return deliverCard(new ImageResponse(element, options))
}
