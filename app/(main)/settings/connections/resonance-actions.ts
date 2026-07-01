'use server'

// Member-facing Resonance Engine consent actions (ADR-385). These are the ONLY callers of the
// self-scoped consent writers in lib/resonance/matches.ts — without them the engine dead-ends
// (opted_in is always false, so every match surface stays empty). Each resolves the caller's own
// profile id SERVER-SIDE via getMyProfileId() and never trusts a client-supplied id: a member can
// only ever set their own consent, and can only opt into a pairing they are one half of (the lib
// writers enforce the confused-deputy guard too). Returns the lib result shape unchanged.

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import {
  setMatchingConsent,
  setTargetOptOut,
  recordMatchOptIn,
} from '@/lib/resonance/matches'

/** Opt the caller IN or OUT of Resonance matching (the master "am I in the pool" switch). */
export async function setResonanceMatching(optedIn: boolean): Promise<{ ok: boolean; error?: string }> {
  const me = await getMyProfileId()
  if (!me) return { ok: false, error: 'Sign in to change this.' }
  const r = await setMatchingConsent(me, optedIn)
  if (r.ok) {
    revalidatePath('/settings/connections')
    revalidatePath('/network/friends')
  }
  return r
}

/** Mute being SUGGESTED to others (stay in the pool for your own matches, but stop appearing in theirs). */
export async function setResonanceTargetMute(optedOut: boolean): Promise<{ ok: boolean; error?: string }> {
  const me = await getMyProfileId()
  if (!me) return { ok: false, error: 'Sign in to change this.' }
  return setTargetOptOut(me, optedOut)
}

/** Tap YES on a specific pairing (the bilateral opt-in). Records ONLY consent — no message is sent
 *  here; an intro still requires both people to say yes AND an operator to approve the draft (the
 *  send_intro_email doctrine is unchanged). Returns whether both sides have now opted in. */
export async function acceptResonanceIntro(
  otherProfileId: string,
): Promise<{ ok: boolean; bothOptedIn: boolean; error?: string }> {
  const me = await getMyProfileId()
  if (!me) return { ok: false, bothOptedIn: false, error: 'Sign in to accept an intro.' }
  const r = await recordMatchOptIn(me, otherProfileId)
  if (r.ok) revalidatePath('/network/friends')
  return r
}
