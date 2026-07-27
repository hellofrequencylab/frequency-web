// The event page cover/hero FOCAL POINT — where the cover image sits inside its cropped hero
// window (a CSS `object-position`). Stored on the existing events.theme jsonb bag under
// `coverFocus`, alongside the `heroHeight` key (lib/events/hero-height.ts) — NO new DB column.
// The centered default ("50% 50%") is dropped when written, so a plain event keeps a sparse
// theme and renders exactly as today (center crop). Backward compatible: an unset value === center.

import {
  DEFAULT_OBJECT_POSITION,
  normalizeObjectPosition,
} from '@/lib/images/focal-point'

/** Read the saved cover focal point out of events.theme (jsonb), defaulting to centered. */
export function readEventCoverFocus(theme: unknown): string {
  if (theme && typeof theme === 'object') {
    const v = (theme as Record<string, unknown>).coverFocus
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return DEFAULT_OBJECT_POSITION
}

/** THE render seam for every cropped event cover — the detail hero, the browse/marketplace/Space
 *  cards, the calendar + Space event popups. Pair it with `object-cover` so the host's chosen focal
 *  point survives the crop identically on every surface:
 *
 *    <Image src={coverUrl} fill className="object-cover" style={eventCoverFocusStyle(coverFocus)} />
 *
 *  `focus` is whatever a loader resolved through readEventCoverFocus (or null/undefined when it
 *  carries none). An event with no stored focus resolves to the centered default, which is exactly
 *  today's plain `object-cover` behavior — so nothing regresses for the events hosts never adjusted.
 *  Pure + total: an empty or whitespace value can never emit a broken object-position. */
export function eventCoverFocusStyle(
  focus: string | null | undefined,
): { objectPosition: string } {
  return { objectPosition: focus?.trim() || DEFAULT_OBJECT_POSITION }
}

/** Merge a chosen cover focal point into an existing theme object, dropping the key when it is
 *  the centered default so the stored theme stays sparse. Returns the next theme. */
export function writeEventCoverFocus(theme: unknown, focus: string): Record<string, unknown> {
  const base = theme && typeof theme === 'object' ? { ...(theme as Record<string, unknown>) } : {}
  const normalized = normalizeObjectPosition(focus)
  if (normalized) base.coverFocus = normalized
  else delete base.coverFocus
  return base
}
