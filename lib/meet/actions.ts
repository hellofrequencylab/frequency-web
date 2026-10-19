'use server'

// TAP TO MEET actions (LIVE-946, ADR-1785). Both resolve the signed-in member themselves; the code is
// the only client input and it is normalized first.

import { type ActionResult, ok, fail } from '@/lib/action-result'
import { getMyProfileId } from '@/lib/auth'
import { resolveMemberDay } from '@/lib/member-day'
import { renderQrSvg } from '@/lib/qr/render'
import { meetUrl, normalizeMeetCode } from './codes'
import { mintMeetCode, tapMeetCode, type MeetCode, type MeetTapOutcome } from './store'

export interface ShownMeetCode extends MeetCode {
  /** The QR of /meet/<code>, rendered server-side. */
  svg: string
}

/** A fresh code and its QR for the member's own screen. */
export async function refreshMeetCode(): Promise<ActionResult<ShownMeetCode>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to show a code.')
  const minted = await mintMeetCode(profileId)
  if (!minted) return fail('Could not make a code right now. Try again.')
  const svg = await renderQrSvg(meetUrl(minted.code), 256)
  return ok({ ...minted, svg })
}

/** Record a meet from the code the member opened or typed. */
export async function tapMeet(raw: unknown): Promise<ActionResult<MeetTapOutcome>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to tap.')
  const code = normalizeMeetCode(raw)
  if (!code) return fail('No code like that. Check the letters and try again.')
  const day = await resolveMemberDay(profileId)
  if (!day) return fail('Could not record that. Try again.')
  const outcome = await tapMeetCode(code, profileId, day)
  if (!outcome) return fail('Tap to meet is not open yet.')
  return ok(outcome)
}
