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

/** Merge a chosen cover focal point into an existing theme object, dropping the key when it is
 *  the centered default so the stored theme stays sparse. Returns the next theme. */
export function writeEventCoverFocus(theme: unknown, focus: string): Record<string, unknown> {
  const base = theme && typeof theme === 'object' ? { ...(theme as Record<string, unknown>) } : {}
  const normalized = normalizeObjectPosition(focus)
  if (normalized) base.coverFocus = normalized
  else delete base.coverFocus
  return base
}
