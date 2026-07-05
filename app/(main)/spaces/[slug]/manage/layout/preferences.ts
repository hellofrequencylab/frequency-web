// PURE preferences-merge helper for the layout layer, kept in its OWN module (NOT the
// 'use server' actions file — a Server Actions file may only export async functions, so a
// synchronous helper exported there fails the production build). Imported by both the
// action and its unit test.
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
