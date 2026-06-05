import { cookies } from 'next/headers'

// Per-member "hide beta demo content" preference. The global demo_mode flag
// (lib/platform-flags.ts) decides whether seeded is_demo content exists at all;
// this lets an individual signed-in member hide it from THEIR view via the header
// toggle, without affecting anyone else. Stored in a plain cookie (same pattern as
// fq_streak_collapsed / fq_attr) so it's read server-side with no extra DB round
// trip. Cookie present + '1' = hide demo content for this viewer.
export const DEMO_HIDE_COOKIE = 'fq_hide_demo'

/** True when the viewer has turned beta/demo content OFF for themselves. */
export async function viewerHidesDemo(): Promise<boolean> {
  try {
    return (await cookies()).get(DEMO_HIDE_COOKIE)?.value === '1'
  } catch {
    return false
  }
}
