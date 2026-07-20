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

// The member's HEADER OVERLAY (the `header` element's 3 styles, ADR-794) — editable per profile. Stored on
// profiles.meta so it needs no column: `headerOverlayStyle` ('none' | 'shadow' | 'fade') + an optional
// `headerOverlayColor` (a CSS color the operator picked for shadow/fade). Profiles default to 'none' (the
// clean cover the owner asked for); an unset value === that default.
export type ProfileOverlayStyle = 'none' | 'shadow' | 'fade'
const OVERLAY_STYLES: readonly ProfileOverlayStyle[] = ['none', 'shadow', 'fade']

/** Read the saved header overlay STYLE out of profiles.meta, defaulting to 'none' (the clean profile cover). */
export function readProfileOverlayStyle(meta: unknown): ProfileOverlayStyle {
  if (meta && typeof meta === 'object') {
    const v = (meta as Record<string, unknown>).headerOverlayStyle
    if (typeof v === 'string' && (OVERLAY_STYLES as readonly string[]).includes(v)) return v as ProfileOverlayStyle
  }
  return 'none'
}

/** Read the saved header overlay COLOR (a CSS color) out of profiles.meta, or null when unset (the token
 *  default applies: ink for shadow, canvas for fade). */
export function readProfileOverlayColor(meta: unknown): string | null {
  if (meta && typeof meta === 'object') {
    const v = (meta as Record<string, unknown>).headerOverlayColor
    // Only ever return a strict hex color — the value is rendered into a CSS color-mix() on the public
    // header, so a non-hex string (tampered/legacy) must never reach the style (CSS injection guard).
    if (typeof v === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v.trim())) {
      return v.trim()
    }
  }
  return null
}

/** Merge a chosen overlay style + color into meta, dropping the keys at their defaults so meta stays sparse
 *  (style 'none' and an empty color are the defaults). Preserves every other meta key. */
export function writeProfileOverlay(meta: unknown, style: string, color: string | null): Record<string, unknown> {
  const base = meta && typeof meta === 'object' ? { ...(meta as Record<string, unknown>) } : {}
  const s = (OVERLAY_STYLES as readonly string[]).includes(style) ? style : 'none'
  if (s === 'none') delete base.headerOverlayStyle
  else base.headerOverlayStyle = s
  // Only a shadow/fade overlay carries a color, and it is STRICTLY a hex color. The value is rendered into
  // a CSS `color-mix(...)` on the public header, so it must never be an arbitrary string a caller POSTed
  // (that would be CSS injection). The native color input only ever yields #rrggbb; anything else is dropped.
  const c = (color ?? '').trim()
  const safe = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c) ? c : ''
  if (s !== 'none' && safe) base.headerOverlayColor = safe
  else delete base.headerOverlayColor
  return base
}
