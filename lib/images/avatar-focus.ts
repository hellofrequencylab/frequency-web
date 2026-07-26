// Avatar focal point IN the URL (ADR-829). A member's chosen avatar crop is stored on
// profiles.meta.avatarFocal, but most of the ~70 places that render an avatar only ever
// select `avatar_url` (nav chips, PersonCard, post authors, rosters, CRM lists...). Rather
// than thread `meta` through every loader, the focal point ALSO rides the stored URL as a
// fragment — `...avatar.jpg#fp=30,68` — so every surface that already carries avatarUrl
// carries the focus for free. A URL fragment never goes over the wire (the browser and the
// next/image optimizer both drop it when fetching), so storage/CDN behavior is unchanged.
//
// Render sites decode through the two tiny helpers below:
//   <Image src={avatarSrc(url)} style={avatarFocusStyle(url)} ... />
// An un-fragmented URL (legacy rows, external OAuth avatars) resolves to undefined style —
// today's centered crop, fully backward compatible. Write sites keep meta.avatarFocal as
// the editing source of truth and mirror it into the URL via withAvatarFocusFragment
// (app/(main)/settings/profile/actions.ts); migration 20261225000000 backfilled old rows.
//
// Dependency-free (imports only the pure focal-point math) so it is safe in server code,
// client components, and unit tests alike.

import {
  clampPercent,
  isDefaultObjectPosition,
  normalizeObjectPosition,
  objectPositionToXY,
} from './focal-point'

/** The focus fragment: `#fp=<x>,<y>` (whole percents), always at the very end of the URL. */
const FOCUS_FRAGMENT_RE = /#fp=(\d{1,3}),(\d{1,3})$/

/** Mirror a chosen focal point ("x% y%") into the URL fragment. Strips any existing focus
 *  fragment first; a centered/default focus stores a clean, fragment-free URL. */
export function withAvatarFocusFragment(
  url: string | null | undefined,
  focus: string | null | undefined,
): string | null {
  if (!url) return null
  const base = url.replace(FOCUS_FRAGMENT_RE, '')
  const normalized = normalizeObjectPosition(focus)
  if (!normalized) return base
  const { x, y } = objectPositionToXY(normalized)
  return `${base}#fp=${x},${y}`
}

/** Read the focal point carried by an avatar URL, as a CSS object-position ("x% y%"), or
 *  null when the URL carries none (or carries the centered default). */
export function readAvatarFocus(url: string | null | undefined): string | null {
  if (!url) return null
  const m = FOCUS_FRAGMENT_RE.exec(url)
  if (!m) return null
  const pos = `${clampPercent(Number(m[1]))}% ${clampPercent(Number(m[2]))}%`
  return isDefaultObjectPosition(pos) ? null : pos
}

/** The URL to actually render (fragment stripped), for <img>/<Image> src. */
export function avatarSrc(url: string): string {
  return url.replace(FOCUS_FRAGMENT_RE, '')
}

/** The style to pair with avatarSrc: an object-position when the URL carries a focus,
 *  undefined otherwise (today's centered crop). */
export function avatarFocusStyle(
  url: string | null | undefined,
): { objectPosition: string } | undefined {
  const focus = readAvatarFocus(url)
  return focus ? { objectPosition: focus } : undefined
}
