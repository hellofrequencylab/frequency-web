'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import {
  THEME_COOKIE,
  type ThemeCookie,
  parseThemeCookie,
  serializeThemeCookie,
} from '@/lib/theme/cookie'
import { isSkinId, DEFAULT_SKIN } from '@/lib/theme/skins'

// The SERVER writer for the member's theme override (the `fxtheme` cookie, docs/THEME.md §6).
// This is the non-test caller the cookie serializer was missing: the settings switcher calls
// these actions, they merge the chosen axis into the existing cookie, write it server-side, and
// revalidate the in-app shell so the new look renders on the next request with zero flash.
//
// The cookie is a non-sensitive UI preference, so it is NOT httpOnly (mirrors the client-side
// THEME_COOKIE_ATTRS: path '/', one-year max-age, lax same-site), and writing it doesn't need an
// auth check beyond the (main) layout already walling these settings routes to signed-in members.
// Every value is guarded before it is stored, so a tampered request can never push an invalid axis.

const ONE_YEAR_SECONDS = 31536000

const THEME_COOKIE_OPTS = {
  path: '/',
  maxAge: ONE_YEAR_SECONDS,
  sameSite: 'lax' as const,
}

/** Read + validate the member's current `fxtheme` cookie (never throws; `{}` on any miss). */
async function readCookie(): Promise<ThemeCookie> {
  try {
    const jar = await cookies()
    return parseThemeCookie(jar.get(THEME_COOKIE)?.value)
  } catch {
    return {}
  }
}

/** Persist a merged ThemeCookie and repaint the in-app shell on the next request. */
async function writeCookie(next: ThemeCookie): Promise<void> {
  const jar = await cookies()
  // An empty override ({}) means "follow the Space / system default" — clear the cookie
  // entirely rather than store an empty object, so the resolver falls through cleanly.
  if (!next.gen && !next.skin && !next.occ) {
    jar.delete(THEME_COOKIE)
  } else {
    jar.set(THEME_COOKIE, serializeThemeCookie(next), THEME_COOKIE_OPTS)
  }
  // The axes drive [data-skin] / [data-generation] / [data-occasion] on the shell root, which
  // re-themes every in-app surface, so refresh the whole authenticated layout.
  revalidatePath('/', 'layout')
}

/**
 * Set (or clear) the SKIN axis (the palette). `id` must be a known skin id; passing the system
 * default (`'default'`) or anything unknown clears the skin override so the Space/system default
 * wins again. Returns nothing — the layout repaints from the new cookie.
 */
export async function setThemeSkin(id: string): Promise<void> {
  const current = await readCookie()
  const next: ThemeCookie = { ...current }
  if (isSkinId(id) && id !== DEFAULT_SKIN) next.skin = id
  else delete next.skin
  await writeCookie(next)
}
