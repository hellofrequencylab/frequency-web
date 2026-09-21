import { RENDITION_PRESETS } from './renditions'
import type { LibraryRenditionKind } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// THE ON-THE-FLY RENDITION RESOLVER (PROG-D3; ruled by the owner on HYG-017).
//
// "One master, many renditions" is delivered by REQUEST, not by storage. HYG-017
// asked the one question — on-the-fly or materialised — and the owner ruled
// ON-THE-FLY on 2026-08-25: renditions are derived at request time, there is no
// `library_renditions` table (created 20260920000000, dropped 20260925000000, and
// it stays dropped), and nothing writes derivative files. This module is the
// resolver that ruling names, and RENDITION_PRESETS' first production consumer.
//
// 🔴 IT IS A PURE STRING REWRITE. No IO, no database, no pixels, and above all NO
// `sharp` — materialising would have meant server-side decode, and check:og-trace
// sits at 67 of a 100-function budget in a seam the picker, page editor, importer
// and email studio all reach (docs/DEPLOY-SAFETY.md). Being pure is also why it
// works in a client component: the Loom picker runs it in the browser.
//
// ⚠️ IT REWRITES THE PATH AND KEEPS THE HOST, deliberately. The catalog holds urls
// on TWO hosts — the project domain and the `api.frequencylocal.com` Supabase
// custom domain — so a resolver that rebuilt the url from NEXT_PUBLIC_SUPABASE_URL
// would silently re-point half the Loom at the wrong origin. Swapping one path
// segment is host-agnostic and survives any future custom domain.
//
// FAIL-OPEN AT EVERY GRAIN, because a thumbnail is a degradation and a broken
// image is an outage. Anything this cannot confidently transform comes back
// UNCHANGED: a non-Supabase url, a data:/blob: url, an SVG, the `source` and
// `custom` kinds, a preset with no width cap. The caller always gets something
// renderable, and a legacy url costs nothing.
//
// 🔴 THE STORED VALUE IS ALWAYS THE MASTER. A rendition url is for DISPLAY only and
// must never be written into a document, a column or an AssetRef cache: the point
// of the reference (ADR-1130) is that one master re-points everywhere, and storing
// a width-capped derivative would freeze a display decision into the data.
//
// COST, stated because it is metered: Supabase bills image transformations per
// distinct ORIGIN image per billing cycle (Pro includes 100, then $5/1,000) — not
// per request, so repeat views and the Smart CDN are free. Measured against a live
// asset: a 2,243,106-byte master returns 28,578 bytes at width 480, a 78x
// reduction, auto-negotiated to WebP.
// ─────────────────────────────────────────────────────────────────────────────

/** The public-object path segment every stored Loom url carries. */
const OBJECT_SEGMENT = '/storage/v1/object/public/'

/** The transform endpoint that serves a derivative of that same object. */
const RENDER_SEGMENT = '/storage/v1/render/image/public/'

/** Supabase refuses a transform outside 1-2500px, so a preset wider than this is served as the master. */
const MAX_TRANSFORM_WIDTH = 2500

/**
 * The display url for one rendition of a Loom master.
 *
 * Returns the input unchanged whenever a transform is not possible or not wanted,
 * so every call site can use it unconditionally in place of the raw url.
 */
export function renditionUrl(url: unknown, kind: LibraryRenditionKind): string {
  if (typeof url !== 'string' || url.length === 0) return ''
  // `source` is the untouched master by definition; `custom` is an editor-produced
  // crop that already IS its own object. Neither has a preset width to apply.
  if (kind === 'source' || kind === 'custom') return url

  const preset = RENDITION_PRESETS[kind]
  const width = preset?.maxWidth
  if (typeof width !== 'number' || width < 1 || width > MAX_TRANSFORM_WIDTH) return url

  const cut = url.indexOf(OBJECT_SEGMENT)
  // Not a Supabase public-object url: an external image, a data:/blob: url, an
  // already-rendered url, or a legacy path. Hand it back untouched.
  if (cut === -1) return url

  const [base, query = ''] = splitQuery(url)
  // A vector is resolution-independent; rasterising it to a thumbnail would cost a
  // transform and lose the thing that makes it worth storing as an SVG.
  if (base.toLowerCase().endsWith('.svg')) return url

  const params = new URLSearchParams(query)
  params.set('width', String(width))
  // Explicit: the Supabase default is `cover`, which CROPS to fit. These presets are
  // width caps, so a tall image must scale rather than lose its top and bottom.
  params.set('resize', 'contain')

  return `${base.replace(OBJECT_SEGMENT, RENDER_SEGMENT)}?${params.toString()}`
}

/** Split a url into its path half and its existing query string (kept, e.g. a cache-buster). */
function splitQuery(url: string): [string, string] {
  const q = url.indexOf('?')
  return q === -1 ? [url, ''] : [url.slice(0, q), url.slice(q + 1)]
}
