// THE LAUNCH HOLD, cookie side (VLS-06). Reads, writes and clears the one httpOnly cookie that lib/launch/pending.ts
// defines the shape of. A plain module, not an action file: see the note there. Server-only.

import { cookies } from 'next/headers'
import { parsePendingLaunch, PENDING_LAUNCH_COOKIE, PENDING_LAUNCH_MAX_AGE, serializePendingLaunch, type PendingLaunch } from './pending'

// authz-ok: reads only the caller's OWN httpOnly cookie. No database touch, no cross-user read. Not an action.
export async function readPendingLaunch(now = new Date()): Promise<PendingLaunch | null> {
  return parsePendingLaunch((await cookies()).get(PENDING_LAUNCH_COOKIE)?.value, now)
}

/** Hold a visitor's answers. The only write a signed-out visitor needs, and it is a cookie, not a row. */
export async function writePendingLaunch(input: Omit<PendingLaunch, 'savedAt'>, now = new Date()): Promise<void> {
  const clean = parsePendingLaunch(serializePendingLaunch(input, now), now)
  if (!clean) return
  ;(await cookies()).set(PENDING_LAUNCH_COOKIE, JSON.stringify(clean), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: PENDING_LAUNCH_MAX_AGE,
  })
}

/** Drop the hold. Called once the claim has made its row, so it is claimed exactly once. */
export async function clearPendingLaunch(): Promise<void> {
  ;(await cookies()).delete(PENDING_LAUNCH_COOKIE)
}
