import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getArticle } from '@/lib/help/content'
import { SITE_NAME } from '@/lib/site'
import { loadNunito } from '@/lib/og/load-nunito'
import { cardResponse } from '@/lib/og/deliver'
import { OG_CONTENT_TYPE } from '@/lib/og/content-type'

export const runtime = 'nodejs'
export const alt = `A help article on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
// JPEG, not PNG. This card puts a photograph across the full 1200x630 canvas, and next/og emits
// lossless PNG: ~1,776KB measured, against ~151KB as JPEG. cardResponse re-encodes and adds the CDN
// cache headers (lib/og/deliver.ts).
export const contentType = OG_CONTENT_TYPE

// ── Per-article share card for /help/<category>/<slug> (LIVE-183) ────────────────────────────────
//
// 🔴 THE DEFECT. `app/(help)/opengraph-image.tsx` is a ROUTE-GROUP file taking no params, so all 57
// articles, 10 category indexes and /help/changelog shared ONE identical card: the wordmark over
// the hero photo with the literal "HELP CENTER". Every help link anyone has ever shared previewed
// as the same picture, whatever it pointed at. SCAN-201 and SCAN-202 closed exactly this for
// podcast Shows and the city/organizer hubs; help was not in that pass.
//
// The group card STAYS, and stays correct: it is still what /help, the category indexes and
// /help/changelog resolve to, because Next takes the card from the closest segment that declares
// one. This file only narrows the card for the article leaf.
//
// ── THE FAN-OUT BUDGET, reasoned before writing rather than after (DEPLOY-SAFETY rule 1) ─────────
//
// `check:og-trace` budgets INCIDENTAL carriers — functions that ship libvips without rasterising a
// card — at 100, and the last production reading (18c997f, 2026-09-05) was 18 rasterising + 64
// incidental. This route adds ZERO incidental functions, and here is why, from the gate's own
// arithmetic (`isRasteriser` excludes any trace whose path contains `opengraph-image`/`twitter-image`
// from the incidental set):
//
//   * The two new traces are card routes, so they land in `rasterisers` (18 -> 20), which has a
//     FLOOR of 5 and no ceiling.
//   * A card is inherited by the pages BELOW its segment. There is exactly one page below
//     `[slug]/` — this article page — and it already carried libvips from the group card above it.
//     The gate's own baseline names "4 under app/(help)", which is /help, /help/[category],
//     /help/[category]/[slug] and /help/changelog: the same four, before and after.
//
// So incidental stays at 64/100 and the placement question the gate exists to answer ("how far UP
// the tree did a card get attached") is answered in the right direction: this moves a card DOWN.
// check:build-budget pays 2 x 17.7MB of libvips on 6.27GB of an 8GB ceiling. Both are readings to
// confirm against the real postbuild output, not to take on trust from this comment.
//
// Satori has no access to the CSS token system, so the two colours are literals mirroring the group
// card (indigo #6366f1) exactly.

const INDIGO = '#6366f1'

/** The same photograph the group card draws, so a help link previews as the help centre whichever
 *  card answers it. Literal path: @vercel/nft cannot resolve one assembled from a variable, and a
 *  parameterised read globs the whole directory into every function that reaches this module
 *  (the ~300MB lesson recorded in lib/og/load-nunito.ts). */
async function heroDataUrl(): Promise<string> {
  const bytes = await readFile(join(process.cwd(), 'public/images/hero.jpg'))
  return `data:image/jpeg;base64,${bytes.toString('base64')}`
}

/** Display size steps with the title so a 58-character headline (the longest in the corpus today)
 *  still sets on two lines inside the 1056px text column. */
function titleSize(title: string): number {
  if (title.length <= 34) return 76
  if (title.length <= 58) return 62
  if (title.length <= 90) return 50
  return 42
}

export default async function Image({
  params,
}: {
  params: Promise<{ category: string; slug: string }>
}) {
  const { category, slug } = await params
  // `.catch(() => null)` for the same reason the city card guards its read: the PAGE must keep
  // 404ing on an unknown slug, but a share card must never be the thing that ends a production
  // export (LIVE-084). A read failure here falls back to the help-centre wordmark, which is exactly
  // what this URL served before this file existed.
  const found = await getArticle(category, slug).catch(() => null)

  const heading = found?.article.title ?? `${SITE_NAME} Help Center`
  const eyebrow = found?.category.title ?? 'Help Center'

  const [heroSrc, black, bold] = await Promise.all([
    heroDataUrl(),
    loadNunito(900),
    loadNunito(700),
  ])

  const fonts = [
    black && { name: 'Nunito', data: black, weight: 900 as const, style: 'normal' as const },
    bold && { name: 'Nunito', data: bold, weight: 700 as const, style: 'normal' as const },
  ].filter(Boolean) as {
    name: string
    data: ArrayBuffer
    weight: 900 | 700
    style: 'normal'
  }[]

  const fontFamily = fonts.length ? 'Nunito' : undefined

  return cardResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative' }}>
        {/* Hero photo */}
        <img
          src={heroSrc}
          alt=""
          width={size.width}
          height={size.height}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
        {/* Legibility scrim — heavier than the group card's, because this one carries body-sized
            type rather than a single 112px wordmark.
            🔴 EXPLICIT top/left/width/height, NOT `inset: 0`, and NOT without `display`. Satori
            implements neither the `inset` shorthand nor CSS's initial `display: block`, so a scrim
            sized only by `inset` collapses to 0x0 and renders NOTHING — silently, because the card
            still returns 200 with a perfectly good photograph under unreadable white text. That is
            the shape the group card shipped in; see the same fix in app/(help)/opengraph-image.tsx. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            backgroundImage:
              'linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.62) 34%, rgba(0,0,0,0.88) 70%, rgba(0,0,0,0.97) 100%)',
          }}
        />
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            padding: 72,
          }}
        >
          {/* Wordmark, small: on an article the TITLE is the subject, not the brand. */}
          <div
            style={{
              display: 'flex',
              fontFamily,
              fontWeight: 700,
              fontSize: 28,
              letterSpacing: '0.32em',
              color: 'rgba(255,255,255,0.88)',
              textShadow: '0 1px 12px rgba(0,0,0,0.6)',
            }}
          >
            {SITE_NAME.toUpperCase()}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Category pill — the one line that tells 57 otherwise-similar cards apart at a glance */}
            <div
              style={{
                display: 'flex',
                alignSelf: 'flex-start',
                marginBottom: 22,
                padding: '8px 18px',
                borderRadius: 9999,
                fontFamily,
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: '#c7d2fe',
                backgroundColor: 'rgba(99,102,241,0.24)',
              }}
            >
              {eyebrow.length > 40 ? `${eyebrow.slice(0, 37)}…` : eyebrow}
            </div>
            <div
              style={{
                width: 84,
                height: 8,
                borderRadius: 9999,
                backgroundColor: INDIGO,
                marginBottom: 26,
              }}
            />
            <div
              style={{
                display: 'flex',
                fontFamily,
                fontWeight: 900,
                fontSize: titleSize(heading),
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                maxWidth: 1056,
                color: '#ffffff',
                textShadow: '0 2px 24px rgba(0,0,0,0.55)',
              }}
            >
              {heading.length > 120 ? `${heading.slice(0, 117)}…` : heading}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              fontFamily,
              fontWeight: 700,
              fontSize: 26,
              letterSpacing: '0.28em',
              color: 'rgba(255,255,255,0.75)',
              textShadow: '0 1px 12px rgba(0,0,0,0.6)',
            }}
          >
            HELP CENTER
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  )
}
