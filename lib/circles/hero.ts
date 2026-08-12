// The Circle page HEADER settings — where the cover image (`circles.image_url`) sits inside its
// cropped hero window (a CSS `object-position`) and how tall that hero is.
//
// This is the Event pair (lib/events/cover-focus.ts + lib/events/hero-height.ts) applied to
// Circles the same way ADR-886 applied it to Channels (lib/channels/hero.ts), deliberately with
// the SAME two keys on the SAME kind of `theme` jsonb bag, so anyone who has read either sibling
// already knows this one. It resolves height through the SHARED Short/Standard/Tall ladder in
// lib/layout/cover-height.ts that events and Business Space covers also use, rather than declaring
// yet another near-identical set of tiers.
//
// A CENTERED FOCUS IS DROPPED ON WRITE, and so is an unparseable height — but an explicitly chosen
// 'standard' height is STORED (the Channel rule, see writeCircleHeroHeight). A Circle nobody has
// tuned keeps an empty `{}` and renders exactly as it does today: unset means centered, and the
// header ELEMENT config keeps deciding the height, which IS the current behaviour. Backward
// compatible by construction — and total on a bag that predates the migration entirely (a select
// that could not find the column feeds `undefined`/`{}` in here and everything still resolves).

import {
  DEFAULT_OBJECT_POSITION,
  normalizeObjectPosition,
} from '@/lib/images/focal-point'
import {
  asCoverHeight,
  COVER_HEIGHT_OPTIONS,
  COVER_HEIGHT_DEFAULT,
  type CoverHeight,
} from '@/lib/layout/cover-height'
import { heroOverlayForScrim, readCoverScrimSetting } from '@/lib/layout/cover-scrim'
import type { HeroOverlayStyle } from '@/components/templates/page-hero'

export type CircleHeroHeight = CoverHeight

/** The height tiers for the Circle hero picker (the shared Short / Standard / Tall ladder). */
export const CIRCLE_HERO_HEIGHTS: { value: CircleHeroHeight; label: string }[] = [
  ...COVER_HEIGHT_OPTIONS,
]

/** Read the saved cover focal point out of circles.theme, defaulting to centered.
 *  Total: a null theme, a non-object, a missing key, or a blank string all resolve to center. */
export function readCircleCoverFocus(theme: unknown): string {
  if (theme && typeof theme === 'object') {
    const v = (theme as Record<string, unknown>).coverFocus
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return DEFAULT_OBJECT_POSITION
}

/** Read the saved hero height out of circles.theme, defaulting to the shared standard.
 *  An unrecognized stored value resolves to the default rather than leaking through as a class. */
export function readCircleHeroHeight(theme: unknown): CircleHeroHeight {
  if (theme && typeof theme === 'object') {
    return asCoverHeight((theme as Record<string, unknown>).heroHeight) ?? COVER_HEIGHT_DEFAULT
  }
  return COVER_HEIGHT_DEFAULT
}

/** Whether the host has actually CHOSEN a hero height, as opposed to inheriting the default.
 *  The Circle page needs this distinction: with no stored choice the header ELEMENT config
 *  (resolveHeaderElement, ADR-793 — the Circle page resolves identity/standard through it) still
 *  decides the height, and a host picking "Standard" must not silently defer to an element tuned
 *  to something else. Only a stored key wins. */
export function hasCircleHeroHeight(theme: unknown): boolean {
  if (!theme || typeof theme !== 'object') return false
  return asCoverHeight((theme as Record<string, unknown>).heroHeight) !== undefined
}

/** Merge a chosen focal point into an existing theme, dropping the key when it is the centered
 *  default so the stored bag stays sparse. Returns the NEXT theme (never mutates the input). */
export function writeCircleCoverFocus(theme: unknown, focus: string): Record<string, unknown> {
  const base = theme && typeof theme === 'object' ? { ...(theme as Record<string, unknown>) } : {}
  const normalized = normalizeObjectPosition(focus)
  if (normalized) base.coverFocus = normalized
  else delete base.coverFocus
  return base
}

/** Merge a chosen hero height into an existing theme, dropping the key only when it is
 *  unparseable. Returns the NEXT theme (never mutates the input). */
export function writeCircleHeroHeight(theme: unknown, height: string): Record<string, unknown> {
  const base = theme && typeof theme === 'object' ? { ...(theme as Record<string, unknown>) } : {}
  const resolved = asCoverHeight(height)
  // DIVERGES from the Event rule of dropping the default, and deliberately — the same divergence
  // Channels made (ADR-886). An Event hero has nothing competing for the height, so there
  // "standard" and "unset" mean the same thing and dropping it is free. The CIRCLE hero also
  // answers to the header ELEMENT config (resolveHeaderElement, ADR-793 — see the Circle page's
  // `size={header.height}`), so if a host picks Standard on a Circle whose element says Tall,
  // dropping the key would silently hand the decision back to the element and the click would
  // appear to do nothing. An explicit choice is therefore always stored; only an unparseable
  // value clears the key.
  if (resolved) base.heroHeight = resolved
  else delete base.heroHeight
  return base
}

/** THE render seam for a cropped Circle cover, the twin of channelCoverFocusStyle. Pair it with
 *  `object-cover` so the host's chosen focal point survives the crop on every surface:
 *
 *    <Image src={cover} fill className="object-cover" style={circleCoverFocusStyle(focus)} />
 *
 *  Pure + total: a blank or whitespace value can never emit a broken object-position. */
export function circleCoverFocusStyle(
  focus: string | null | undefined,
): { objectPosition: string } {
  return { objectPosition: focus?.trim() || DEFAULT_OBJECT_POSITION }
}

/** The Circle's cover OVERLAY, ready for the template's `coverOverlayStyle` prop.
 *
 *  A delegation, deliberately: the operator's three words live in `lib/layout/cover-scrim.ts`
 *  (re-exported from the Space's already-shipped reader) and the word → prop mapping lives there
 *  too. This function only says "read it off a Circle's theme blob", which is the one part that is
 *  Circle-specific. A second copy of the mapping is exactly how Spaces and Circles would drift into
 *  disagreeing about what "Blend" looks like.
 */
export function circleHeroOverlayStyle(theme: unknown): HeroOverlayStyle {
  return heroOverlayForScrim(readCoverScrimSetting(theme))
}
