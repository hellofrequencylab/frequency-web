import { cookies } from 'next/headers'
import { INDUCTION_BEAT_COUNT } from '@/lib/onboarding/funnel-script'

// The induction in progress: the answers a visitor has given so far and the beat they are on.
//
// A PLAIN MODULE, NOT AN ACTION FILE, and that is the point of it existing separately. The cookie
// below is httpOnly so page script cannot read a member's parked name and city. Putting the reader
// in ./actions.ts ('use server') would have published it as a callable endpoint and handed that
// same content straight back to any script that asked — undoing the flag for the sake of tidiness.
// The server component imports the reader from here; only the WRITE, which a signed-out client
// genuinely has to invoke, stays an action.
//
// Where the induction parks the answers across the auth round-trip. The avatar (too big for a cookie) goes to localStorage on the
// client under 'fq_pending_avatar' and is uploaded by /join/complete.
//
// ── IT IS ALSO THE RESUME STORE (2026-09-11) ────────────────────────────────────────────────
// This cookie used to live exactly one hour, because its only reader was /join/complete and an
// hour is how long a magic link is worth waiting on. That made the induction UNRESUMABLE: the
// page never passed `initialBeat`, so every arrival at /join restarted at beat 0 no matter how
// far the visitor had already got — while the copy under the Beat-0 email field promised "Your
// email saves your spot so you can finish later". Nothing restored the spot. A member whose
// profile carries no completion flag is redirected here by the app-shell gate on EVERY sign-in,
// so the two together are a closed loop: sign in, land on beat 0, give up, repeat.
//
// The fix is to make this cookie mean what its name always implied — the induction in progress —
// so it is written at every beat (not only in front of auth) and lives 30 days, matching the
// fq_persona / fq_interests / fq_beta_seq family that already parks answers for the same flow.
// It stays httpOnly, which is what lets it hold a name and a city; the rest of that family is
// readable by script and could not.
//
// 🔴 It must therefore be CLEARED on every completion path, not just the deferred one. The
// signed-in member submits through completeInduction, which never touched this cookie when it
// could only last an hour and could only be written by the signed-out flow. Leaving a stale one
// behind now would drop a finished member back into a half-filled induction the next time any
// funnel link took them to /join.
export const PENDING_INDUCTION_COOKIE = 'fq_pending_induction'
export const PENDING_INDUCTION_MAX_AGE = 60 * 60 * 24 * 30 // 30 days — same as the rest of the funnel's parked answers

export interface InductionData {
  displayName: string
  handle: string
  bio: string
  avatarUrl: string
  location: string
  lat: number | null
  lng: number | null
  intent: string
  interests: string
  heardAbout: string
  /** How far they got, so a return visit resumes instead of restarting. Optional: a cookie
   *  written by a build before this field existed parses fine and simply resumes at 0. */
  beat?: number
}


// authz-ok: reads only the caller's OWN httpOnly cookie and returns what that same browser put
// there. No database touch, no cross-user read. Not an action — see the header.
/**
 * Read back the induction in progress, so /join can resume it instead of restarting at beat 0.
 *
 * NON-DESTRUCTIVE, unlike finalizePendingInduction's read: someone who lands on /join and leaves
 * again without finishing must still find their answers on the next visit. The cookie is cleared
 * only when the induction actually completes (both paths) — see the header note.
 */
export async function readPendingInduction(): Promise<InductionData | null> {
  const raw = (await cookies()).get(PENDING_INDUCTION_COOKIE)?.value
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as InductionData
    // Shape-check the one field the UI positions itself by; the rest are plain strings that
    // render harmlessly even if a hand-edited cookie makes them odd.
    return { ...data, beat: clampBeat(data.beat) }
  } catch {
    return null
  }
}

/** Drop the induction-in-progress cookie. Called from BOTH completion paths — see the header. */
export async function clearPendingInduction() {
  ;(await cookies()).delete(PENDING_INDUCTION_COOKIE)
}

/** A stored beat is only ever a small integer inside the flow. Anything else (absent, NaN, a
 *  number from a build with more beats) resolves to 0, which restarts rather than stranding
 *  someone on a beat that does not exist. */
export function clampBeat(beat: number | undefined): number {
  if (typeof beat !== 'number' || !Number.isFinite(beat)) return 0
  return Math.min(Math.max(Math.trunc(beat), 0), INDUCTION_BEAT_COUNT - 1)
}
