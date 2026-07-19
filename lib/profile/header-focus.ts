// A member's profile HEADER (hero) FOCAL POINT — where the header banner sits inside its cropped
// hero window (a CSS `object-position`). Stored on the existing profiles.meta jsonb bag under
// `headerFocal` — NO new DB column. The centered default ("50% 50%") is dropped when written, so a
// plain profile keeps a sparse meta and renders exactly as today (center crop). Backward compatible:
// an unset value === center. Mirrors lib/events/cover-focus.ts exactly.

import {
  DEFAULT_OBJECT_POSITION,
  normalizeObjectPosition,
} from '@/lib/images/focal-point'

/** Read the saved header focal point out of profiles.meta (jsonb), defaulting to centered. */
export function readProfileHeaderFocus(meta: unknown): string {
  if (meta && typeof meta === 'object') {
    const v = (meta as Record<string, unknown>).headerFocal
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return DEFAULT_OBJECT_POSITION
}

/** Merge a chosen header focal point into an existing meta object, dropping the key when it is the
 *  centered default so the stored meta stays sparse. Preserves every other meta key. Returns the next meta. */
export function writeProfileHeaderFocus(meta: unknown, focus: string): Record<string, unknown> {
  const base = meta && typeof meta === 'object' ? { ...(meta as Record<string, unknown>) } : {}
  const normalized = normalizeObjectPosition(focus)
  if (normalized) base.headerFocal = normalized
  else delete base.headerFocal
  return base
}

/** Read the saved AVATAR focal point out of profiles.meta (jsonb), defaulting to centered. Same shape as
 *  the header focal, but under `avatarFocal` — it positions the profile photo inside its round crop. */
export function readProfileAvatarFocus(meta: unknown): string {
  if (meta && typeof meta === 'object') {
    const v = (meta as Record<string, unknown>).avatarFocal
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return DEFAULT_OBJECT_POSITION
}

/** Merge a chosen AVATAR focal point into an existing meta object, dropping the key when it is the centered
 *  default so the stored meta stays sparse. Preserves every other meta key. Returns the next meta. */
export function writeProfileAvatarFocus(meta: unknown, focus: string): Record<string, unknown> {
  const base = meta && typeof meta === 'object' ? { ...(meta as Record<string, unknown>) } : {}
  const normalized = normalizeObjectPosition(focus)
  if (normalized) base.avatarFocal = normalized
  else delete base.avatarFocal
  return base
}
