// PURE preferences-merge helper for the layout layer, kept in its OWN module (NOT the
// 'use server' actions file — a Server Actions file may only export async functions, so a
// synchronous helper exported there fails the production build). Imported by both the
// action and its unit test.

import {
  DEFAULT_OBJECT_POSITION,
  normalizeObjectPosition,
} from '@/lib/images/focal-point'
//
// The structural-template reader (`readProfileTemplate`) was retired with the template picker (ADR-526):
// the freeform rows model superseded the fixed templates, so a space profile no longer stores or reads a
// `template`. The legacy `template` key is still tolerated on READ by the entity-layout model itself
// (resolveRows), so any old saved value keeps rendering.

// ── COVER SIZE (always Hero, ADR-526) ──────────────────────────────────────────────────────────────
// A Space profile ALWAYS uses the tall, immersive `hero` cover (never the compact `header` band) — the
// operator toggle was retired (ADR-526: "Space profile always uses Hero image layout"). This reader is
// kept as the ONE seam the public layout + manage page read, and now returns a constant so the whole app
// renders hero uniformly regardless of any stale `coverSize` value a preferences blob still carries.

export type CoverSize = 'header' | 'hero'

/** The Space cover size. ALWAYS 'hero' (ADR-526) — the header option was removed. Keeps its optional
 *  `preferences` param so existing call sites (which pass the blob) are unchanged. PURE + total. */
export function readCoverSize(preferences?: unknown): CoverSize {
  void preferences
  return 'hero'
}

// ── HERO COVER SCRIM (Shade vs Blend) ────────────────────────────────────────────────────────────
// Only matters for the Hero cover size, where the identity (logo + name + actions) is OVERLAID on the
// bottom of the cover image. Two treatments the operator chooses between:
//   'shade' (default) — a dark ink scrim behind the overlaid identity, so light on-ink text stays
//                       WCAG-legible on ANY photo. Safe out of the box.
//   'blend'           — a gradient that fades to the PAGE background (canvas) so the photo melts into
//                       the page; the overlaid identity uses the theme's own text tokens. Reads softer
//                       and matches the page, at the cost of photo-dependent legibility.
// Fail-safe to 'shade' for any missing/malformed value (matches the already-shipped behavior).

export type CoverScrim = 'shade' | 'blend'

/** Read the operator's chosen Hero scrim off a raw preferences blob. Default-safe to 'shade'. PURE. */
export function readCoverScrim(preferences: unknown): CoverScrim {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return 'shade'
  return (preferences as Record<string, unknown>).coverScrim === 'blend' ? 'blend' : 'shade'
}

/** Compute the next preferences blob for a scrim change. Non-destructive: only `coverScrim` is
 *  written, every other key preserved. PURE. */
export function nextCoverScrimPreferences(
  current: Record<string, unknown>,
  scrim: CoverScrim,
): Record<string, unknown> {
  return { ...current, coverScrim: scrim }
}

// ── HERO COVER FOCAL POINT (where the cover sits in its cropped hero window) ─────────────────────
// The Space cover is rendered with `object-cover`, which crops to center by default, so a face or a
// horizon often gets cut off. The operator repositions it with the SAME reusable ImageFocalPicker the
// admin EVENT rail uses (components/ui/image-focal-picker + lib/images/focal-point): the chosen focal
// point is a CSS `object-position` string ("x% y%"), applied on the hero <Image>. Stored under a new
// `coverFocus` key on the EXISTING preferences jsonb (mirrors the event's theme.coverFocus) — NO new DB
// column. The centered default ("50% 50%") is dropped when written, so a plain Space keeps a sparse
// preferences blob and renders exactly as today (center crop). Backward compatible: unset === center.

/** Read the saved cover focal point off a raw preferences blob, defaulting to centered. PURE. */
export function readCoverFocus(preferences: unknown): string {
  if (preferences && typeof preferences === 'object' && !Array.isArray(preferences)) {
    const v = (preferences as Record<string, unknown>).coverFocus
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return DEFAULT_OBJECT_POSITION
}

/** Compute the next preferences blob for a cover-focus change. Non-destructive: only `coverFocus` is
 *  written (every other key preserved), and the centered default drops the key so the blob stays
 *  sparse. PURE. */
export function nextCoverFocusPreferences(
  current: Record<string, unknown>,
  focus: string,
): Record<string, unknown> {
  const next = { ...current }
  const normalized = normalizeObjectPosition(focus)
  if (normalized) next.coverFocus = normalized
  else delete next.coverFocus
  return next
}
