// The Channel page HEADER settings — where the cover image sits inside its cropped hero window (a
// CSS `object-position`) and how tall that hero is.
//
// This is the Event pair (lib/events/cover-focus.ts + lib/events/hero-height.ts) applied to
// Channels, deliberately with the SAME two keys on the SAME kind of `theme` jsonb bag, so anyone who
// has read the Event side already knows this one. It resolves height through the SHARED
// Short/Standard/Tall ladder in lib/layout/cover-height.ts that events and Business Space covers
// also use, rather than declaring a third near-identical set of tiers.
//
// THE DEFAULTS ARE DROPPED ON WRITE. A centered focus and the 'standard' height are never
// persisted, so a Channel nobody has tuned keeps an empty `{}` and renders exactly as it does
// today. That makes this backward compatible by construction: unset means centered and standard,
// which IS the current behaviour, so nothing changes for a Channel no operator ever touches.

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

export type ChannelHeroHeight = CoverHeight

/** The height tiers for the Channel hero picker (the shared Short / Standard / Tall ladder). */
export const CHANNEL_HERO_HEIGHTS: { value: ChannelHeroHeight; label: string }[] = [
  ...COVER_HEIGHT_OPTIONS,
]

/** Read the saved cover focal point out of topical_channels.theme, defaulting to centered.
 *  Total: a null theme, a non-object, a missing key, or a blank string all resolve to center. */
export function readChannelCoverFocus(theme: unknown): string {
  if (theme && typeof theme === 'object') {
    const v = (theme as Record<string, unknown>).coverFocus
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return DEFAULT_OBJECT_POSITION
}

/** Read the saved hero height out of topical_channels.theme, defaulting to the shared standard.
 *  An unrecognized stored value resolves to the default rather than leaking through as a class. */
export function readChannelHeroHeight(theme: unknown): ChannelHeroHeight {
  if (theme && typeof theme === 'object') {
    return asCoverHeight((theme as Record<string, unknown>).heroHeight) ?? COVER_HEIGHT_DEFAULT
  }
  return COVER_HEIGHT_DEFAULT
}

/** Whether the operator has actually CHOSEN a hero height, as opposed to inheriting the default.
 *  The Channel page needs this distinction: with no stored choice the header ELEMENT config
 *  (resolveHeaderElement, ADR-793) still decides the height, and an operator picking "Standard"
 *  must not silently override an element tuned to something else. Only a stored key wins. */
export function hasChannelHeroHeight(theme: unknown): boolean {
  if (!theme || typeof theme !== 'object') return false
  return asCoverHeight((theme as Record<string, unknown>).heroHeight) !== undefined
}

/** Merge a chosen focal point into an existing theme, dropping the key when it is the centered
 *  default so the stored bag stays sparse. Returns the NEXT theme (never mutates the input). */
export function writeChannelCoverFocus(theme: unknown, focus: string): Record<string, unknown> {
  const base = theme && typeof theme === 'object' ? { ...(theme as Record<string, unknown>) } : {}
  const normalized = normalizeObjectPosition(focus)
  if (normalized) base.coverFocus = normalized
  else delete base.coverFocus
  return base
}

/** Merge a chosen hero height into an existing theme, dropping the key when it is the standard
 *  default. Returns the NEXT theme (never mutates the input). */
export function writeChannelHeroHeight(theme: unknown, height: string): Record<string, unknown> {
  const base = theme && typeof theme === 'object' ? { ...(theme as Record<string, unknown>) } : {}
  const resolved = asCoverHeight(height)
  // DIVERGES from the Event rule of dropping the default, and deliberately. An Event hero has
  // nothing competing for the height, so there "standard" and "unset" mean the same thing and
  // dropping it is free. A CHANNEL hero also answers to the header ELEMENT config
  // (resolveHeaderElement, ADR-793), so if an operator picks Standard on a Channel whose element
  // says Tall, dropping the key would silently hand the decision back to the element and the click
  // would appear to do nothing. An explicit choice is therefore always stored; only an unparseable
  // value clears the key.
  if (resolved) base.heroHeight = resolved
  else delete base.heroHeight
  return base
}

/** THE render seam for a cropped Channel cover, the twin of eventCoverFocusStyle. Pair it with
 *  `object-cover` so the operator's chosen focal point survives the crop on every surface:
 *
 *    <Image src={cover} fill className="object-cover" style={channelCoverFocusStyle(focus)} />
 *
 *  Pure + total: a blank or whitespace value can never emit a broken object-position. */
export function channelCoverFocusStyle(
  focus: string | null | undefined,
): { objectPosition: string } {
  return { objectPosition: focus?.trim() || DEFAULT_OBJECT_POSITION }
}
