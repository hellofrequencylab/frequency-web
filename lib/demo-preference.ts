import { cookies } from 'next/headers'
import { isAnonymousRender } from '@/lib/core/anonymous-render'

// Per-member "hide beta demo content" preference. The global demo_mode flag
// (lib/platform-flags.ts) decides whether seeded is_demo content exists at all;
// this lets an individual signed-in member hide it from THEIR view via the header
// toggle, without affecting anyone else. Stored in a plain cookie (same pattern as
// fq_streak_collapsed / fq_attr) so it's read server-side with no extra DB round
// trip. Cookie present + '1' = hide demo content for this viewer.
export const DEMO_HIDE_COOKIE = 'fq_hide_demo'

/** True when the viewer has turned beta/demo content OFF for themselves.
 *
 *  A per-viewer preference is meaningless on an ANONYMOUS RENDER and reading it there is harmful:
 *  those pages are ISR (one document served to everyone), so this `cookies()` call would both void
 *  the cache and bake one visitor's toggle into every other visitor's copy. Most identity reads are
 *  neutralised further down, inside `getCachedUser` (lib/core/anonymous-render.ts); this one is not,
 *  because it reads a cookie DIRECTLY rather than resolving a viewer — so it has to answer for
 *  itself. It is the only other such reader on the public Space render at the time of writing. */
export async function viewerHidesDemo(): Promise<boolean> {
  if (isAnonymousRender()) return false
  try {
    return (await cookies()).get(DEMO_HIDE_COOKIE)?.value === '1'
  } catch {
    return false
  }
}
