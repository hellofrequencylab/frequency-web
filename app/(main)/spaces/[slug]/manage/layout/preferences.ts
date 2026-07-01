import type { SpaceTemplate } from '@/lib/spaces/templates'

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

/** Compute the next preferences blob for a layout change. PURE:
 *   - 'auto'  -> delete the `template` override (derive from type + Focus).
 *   - a template id -> set `template` to it.
 *   - opts.reset -> also delete the `puck` doc (so the new layout's preset actually shows).
 *  Every other preferences key is preserved (non-destructive merge). */
export function nextLayoutPreferences(
  current: Record<string, unknown>,
  template: SpaceTemplate | 'auto',
  opts?: { reset?: boolean },
): Record<string, unknown> {
  const next = { ...current }
  if (template === 'auto') delete next.template
  else next.template = template
  if (opts?.reset) delete next.puck
  return next
}
