// A Journey's HEADER (hero) FOCAL POINT — where the cover banner sits inside its cropped hero window
// (a CSS `object-position`). Stored on the dedicated `journey_plans.cover_focus` text column. The
// centered default ("50% 50%") is dropped to null on write so the column stays sparse and a plain
// Journey renders exactly as today (center crop). Backward compatible: an unset value === center.
// Mirrors lib/profile/header-focus.ts.

import { DEFAULT_OBJECT_POSITION, normalizeObjectPosition } from '@/lib/images/focal-point'

/** Read a Journey's saved cover focal point, defaulting to centered. */
export function readJourneyCoverFocus(coverFocus: string | null | undefined): string {
  if (typeof coverFocus === 'string' && coverFocus.trim()) return coverFocus.trim()
  return DEFAULT_OBJECT_POSITION
}

/** Normalize a chosen focal point for storage; null for the centered default so the column stays sparse. */
export function normalizeJourneyCoverFocus(focus: string): string | null {
  return normalizeObjectPosition(focus) || null
}
