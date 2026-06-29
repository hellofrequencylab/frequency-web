// SPLASH content for a space-scoped managed code (ENTITY-SPACES-BUILD §C, Phase 2). A SPLASH is a
// small landing page a /q/<slug> scan can land on instead of a bare redirect: a heading, a short
// blurb, an optional image, and a few links/CTAs. It is a CONSTRAINED block list that reuses the kit
// semantics (heading + blurb + links + image), NOT a Puck block tree. Keeping the shape small and
// flat is the whole point: the owner editor renders a fixed set of fields, the /q resolver renders a
// fixed layout, and there is no free-form HTML/markup to sanitize.
//
// This module is PURE: no Supabase/Next imports, so normalizeSplash is fully unit-testable
// (lib/qr/splash.test.ts) with no DB. The DB write seam (setCodeSplash) lives in
// lib/qr/space-codes.ts and calls normalizeSplash before it stores the jsonb, so the stored blob is
// always already clean. FAIL-CLOSED throughout: a malformed splash normalizes to a minimal valid
// shape (or null where it cannot be made valid), never trusted as-is.
//
// VOICE: any copy this module ships (defaults, the link-vs-redirect semantics) obeys NAMING +
// CONTENT-VOICE. The owner types their own heading/blurb/labels; the editor + the §10 checklist
// guard those. No em/en dashes anywhere here.

import { isValidTargetUrl } from './codes'

// ── Caps (so a malformed/hostile splash can never store an unbounded blob) ───────────────────────
const MAX_HEADING_LEN = 80
const MAX_BLURB_LEN = 400
const MAX_LINKS = 5
const MAX_LINK_LABEL_LEN = 60
const MAX_IMAGE_URL_LEN = 2048

// ── Types ────────────────────────────────────────────────────────────────────────────────────────

/** One link/CTA on a splash. `label` is the plain button/link text the visitor reads; `url` is any
 *  http(s) URL or a site-relative path (validated by isValidTargetUrl, the same guard the resolver
 *  uses). The FIRST link in `links` is the PRIMARY CTA: when a splash has one, the /q resolver may
 *  redirect straight to it (see render-time handling in app/q/[slug]/route.ts). */
export interface SplashLink {
  label: string
  url: string
}

/** The constrained splash content shape. A flat record of kit-shaped fields:
 *   - heading: the big line (required for a valid splash).
 *   - blurb:   one short paragraph under the heading (optional).
 *   - imageUrl: an optional banner/logo image (http(s) or same-origin only).
 *   - links:   up to 5 links/CTAs; links[0] is the primary CTA.
 *  Reuses the kit's heading + blurb + link + image semantics; deliberately NOT a Puck block tree. */
export interface Splash {
  heading: string
  blurb: string | null
  imageUrl: string | null
  links: SplashLink[]
}

// ── PURE: normalization + validation (no IO, fully testable) ─────────────────────────────────────

/** Trim a raw value to a clean string capped at `max`, or '' if it is not a usable string. Pure. */
function cleanString(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return ''
  return raw.trim().slice(0, max)
}

/** An image url is kept only when it is a real http(s) URL or a site-relative path AND within the
 *  length cap; anything else (data: URIs, javascript:, junk) is dropped to null. Pure + fail-closed. */
function normalizeImageUrl(raw: unknown): string | null {
  const url = cleanString(raw, MAX_IMAGE_URL_LEN)
  if (!url) return null
  return isValidTargetUrl(url) ? url : null
}

/** Coerce a raw value to a clean list of SplashLinks: each must have a non-empty label AND a valid
 *  target url; the label is trimmed/capped and the count is capped at MAX_LINKS. A link missing
 *  either field is DROPPED (never half-rendered). Pure + fail-closed. */
export function normalizeLinks(raw: unknown): SplashLink[] {
  if (!Array.isArray(raw)) return []
  const out: SplashLink[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as { label?: unknown; url?: unknown }
    const label = cleanString(r.label, MAX_LINK_LABEL_LEN)
    const url = cleanString(r.url, MAX_IMAGE_URL_LEN)
    if (!label || !url || !isValidTargetUrl(url)) continue
    out.push({ label, url })
    if (out.length >= MAX_LINKS) break
  }
  return out
}

/** Normalize a raw value into a clean Splash, or null if it cannot be made valid. A splash MUST have
 *  a non-empty heading; everything else defaults sensibly (no blurb, no image, no links). Fail-closed:
 *  a headingless / malformed splash is null (so the resolver falls back to the code's normal
 *  redirect). Pure: the write seam and the test share it. */
export function normalizeSplash(raw: unknown): Splash | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as {
    heading?: unknown
    blurb?: unknown
    imageUrl?: unknown
    links?: unknown
  }
  const heading = cleanString(r.heading, MAX_HEADING_LEN)
  if (!heading) return null
  const blurb = cleanString(r.blurb, MAX_BLURB_LEN)
  return {
    heading,
    blurb: blurb || null,
    imageUrl: normalizeImageUrl(r.imageUrl),
    links: normalizeLinks(r.links),
  }
}

/** The PRIMARY CTA of a splash (links[0]) or null. The /q resolver reads this to decide whether a
 *  scan can redirect straight to the splash's primary action instead of rendering the landing. Pure. */
export function primarySplashLink(splash: Splash | null | undefined): SplashLink | null {
  if (!splash) return null
  return splash.links[0] ?? null
}

/** An empty splash draft for the owner editor's initial state (a heading the owner replaces, no
 *  blurb/image/links). Plain copy, no narrated feelings, no em/en dashes (CONTENT-VOICE §10). */
export function emptySplash(): Splash {
  return { heading: '', blurb: null, imageUrl: null, links: [] }
}
