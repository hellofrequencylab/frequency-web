import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import GroupCard from './opengraph-image'
import ArticleCard from './help/[category]/[slug]/opengraph-image'

// ── The help cards' legibility scrim, which drew NOTHING for months ──────────────────────────────
//
// 🔴 THE BUG, found while adding the per-article card (LIVE-183). Both help cards lay white display
// type over `public/images/hero.jpg` — a bright, high-key beach photograph — and darkened it with a
// full-bleed gradient sized `position: absolute; inset: 0`, carrying no `display`. Satori implements
// neither the `inset` shorthand nor CSS's initial `display: block`, so that element resolved to 0x0
// and painted nothing. The shipped card was white text on white sand: the 112px wordmark survived,
// "HELP CENTER" was very nearly invisible.
//
// NOTHING CAUGHT IT, and nothing could have. The route returned 200 with a well-formed, correctly
// sized, correctly cached JPEG every single time — `check:og-trace` green, `og-deliver.test.ts`
// green, byte size normal. The only symptom was a washed-out card in someone else's message thread.
// That is DEPLOY-SAFETY rule 6 exactly: a fail-safe with no gate that notices it fired.
//
// So this measures the PIXELS. Restore `inset: 0` (or drop `display`) on either scrim and the
// matching case below goes red.

/** Mean luminance (0-255) of a horizontal band of a rendered card, given as a share of full height.
 *
 *  ⚠️ `.stats()` reads sharp's INPUT, not its pipeline, so the crop has to be materialised to a
 *  buffer first — measuring the un-cropped card returns the same whole-image mean for every band
 *  and the test passes on any card at all. */
async function bandLuminance(res: Response, from: number, to: number): Promise<number> {
  const buf = Buffer.from(await res.arrayBuffer())
  const top = Math.round(630 * from)
  const cut = await sharp(buf)
    .extract({ left: 0, top, width: 1200, height: Math.min(Math.round(630 * (to - from)), 630 - top) })
    .greyscale()
    .png()
    .toBuffer()
  return (await sharp(cut).stats()).channels[0].mean
}

// ── MEASURED, not guessed (2026-09-07, this checkout) ────────────────────────────────────────────
//
//   band        group card   article card   the RAW photograph, unscrimmed
//   0.85-1.00        15.6           14.4          207.4
//   0.70-0.85        53.4           25.5          184.8
//   0.50-0.70        88.5           78.0          217.7
//
// The thresholds sit in the empty middle of those columns: wide enough that re-tuning a gradient
// stop cannot trip them, narrow enough that a scrim which vanishes always does.
const FOOT_MAX = 60
const TITLE_MAX = 130

describe('the help share cards actually draw their scrim', () => {
  it('the group card is dark under the wordmark', async () => {
    expect(await bandLuminance(await GroupCard(), 0.85, 1)).toBeLessThan(FOOT_MAX)
  }, 120_000)

  it('the per-article card is dark under its title and its footer', async () => {
    const card = () =>
      ArticleCard({
        params: Promise.resolve({ category: 'getting-started', slug: 'join-a-circle' }),
      })
    expect(await bandLuminance(await card(), 0.85, 1)).toBeLessThan(FOOT_MAX)
    expect(await bandLuminance(await card(), 0.5, 0.7)).toBeLessThan(TITLE_MAX)
  }, 120_000)

  it('and the photograph underneath really is bright, so the bar above means something', async () => {
    // Without this the two assertions could pass on a card that draws no photo at all.
    const raw = await sharp('public/images/hero.jpg').resize(1200, 630, { fit: 'cover' }).jpeg().toBuffer()
    expect(await bandLuminance(new Response(new Uint8Array(raw)), 0.85, 1)).toBeGreaterThan(150)
  }, 120_000)
})
