import 'server-only'
import { cookies } from 'next/headers'
import { type GenerationId, DEFAULT_GENERATION, resolveGeneration } from '../generations'
import { type SkinId, DEFAULT_SKIN, resolveSkin } from '../skins'
import { type OccasionId, resolveOccasionForDate } from '../occasions'
import { THEME_COOKIE, parseThemeCookie } from '../cookie'

// The server THEME RESOLVER — the one place the three theme axes are resolved for a
// request, applying the precedence the layout agent sets onto the shell as
// [data-generation] / [data-skin] / [data-occasion]. Server-only (it reads the request
// cookie jar via next/headers, which is async in this Next version), so it is imported
// from the layout, NOT from lib/theme/index.ts (which stays client-safe and re-exports
// only the ResolvedTheme TYPE).
//
// Precedence (docs/SPACES.md adaptive-theming ADR):
//   1. The member's `fxtheme` cookie  — an explicit personal override wins.
//   2. The Space default (spaceSkin / spaceGeneration) — the operator's choice next.
//   3. The system/time default — DEFAULT_* for skin/generation; the calendar window for
//      the occasion (which has no Space default — it is purely time-driven unless the
//      member pins one via the cookie).
// Every value is passed through a resolve* guard, so the result is always valid ids.

/** The fully resolved theme for a request — the three axes the shell will set as data-attrs. */
export interface ResolvedTheme {
  skin: SkinId
  generation: GenerationId
  occasion: OccasionId
}

/**
 * Resolve the theme for the current request. Reads the `fxtheme` cookie, then layers the
 * optional Space defaults and the system/time defaults per the precedence above.
 *
 * @param input.spaceSkin       the Space's `spaces.skin` value, if any (precedence 2).
 * @param input.spaceGeneration the Space's `spaces.generation` value, if any (precedence 2).
 * @param input.now             clock override for the occasion window (defaults to new Date()).
 */
export async function resolveTheme(input?: {
  spaceSkin?: string | null
  spaceGeneration?: string | null
  now?: Date
}): Promise<ResolvedTheme> {
  const cookie = await readThemeCookie()
  const now = input?.now ?? new Date()

  // generation: member cookie → Space default → system default.
  const generation = resolveGeneration(
    cookie.gen ?? input?.spaceGeneration ?? DEFAULT_GENERATION,
  )

  // skin: member cookie → Space default → system default.
  const skin = resolveSkin(cookie.skin ?? input?.spaceSkin ?? DEFAULT_SKIN)

  // occasion: member cookie pin → otherwise whatever the calendar window says.
  const occasion: OccasionId = cookie.occ ?? resolveOccasionForDate(now)

  return { skin, generation, occasion }
}

/** Read + validate the `fxtheme` cookie. Never throws (cookies() can throw out of scope). */
async function readThemeCookie() {
  try {
    const jar = await cookies()
    return parseThemeCookie(jar.get(THEME_COOKIE)?.value)
  } catch {
    return {}
  }
}
