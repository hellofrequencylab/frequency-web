// PURE preferences-merge helper for the layout layer, kept in its OWN module (NOT the
// 'use server' actions file — a Server Actions file may only export async functions, so a
// synchronous helper exported there fails the production build). Imported by both the
// action and its unit test.

// ── COVER SIZE (Header vs Hero) ──────────────────────────────────────────────────────────────────
// The public Space header's cover band has two sizes: a compact `header` band (the default) and a
// tall `hero` band. It rides the same untyped `preferences` tail as the layout override, read by the
// public profile layout and written by the Layout manage panel. Fail-safe to `header` for any missing
// or malformed value, so an un-migrated Space renders the compact band.

export type CoverSize = 'header' | 'hero'

/** Read the operator's chosen cover size off a raw preferences blob. Default-safe to 'header'. PURE. */
export function readCoverSize(preferences: unknown): CoverSize {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return 'header'
  return (preferences as Record<string, unknown>).coverSize === 'hero' ? 'hero' : 'header'
}

/** Compute the next preferences blob for a cover-size change. Non-destructive: only the `coverSize`
 *  node is written, every other key preserved. PURE. */
export function nextCoverSizePreferences(
  current: Record<string, unknown>,
  size: CoverSize,
): Record<string, unknown> {
  return { ...current, coverSize: size }
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
