'use server'

// FIND A TIME FROM AN EMAIL LINK (EMAIL-092). Token-authorised: no login, and the signed link in the
// URL is the authorisation. saveGuestVote re-verifies it before every write and touches only that
// link's Plan and that link's email address (lib/calendar/time-vote-guest.ts). Never reveals whether
// a Plan exists: a bad link and a removed Plan return the same sentence.

import { fail, ok, type ActionResult } from '@/lib/action-result'
import { loadGuestPoll, saveGuestVote, type GuestPoll } from '@/lib/calendar/time-vote-guest'
import { verifyTimeVoteToken } from '@/lib/calendar/time-vote-token'

export async function answerByEmailLink(token: string, entryId: string, choice: string | null, name: string): Promise<ActionResult<GuestPoll>> {
  // The link is the gate: refuse before anything is read. saveGuestVote verifies it again itself.
  if (!verifyTimeVoteToken(token)) return fail('This link is invalid or expired.')
  const res = await saveGuestVote(token, entryId, choice, name)
  if ('error' in res) return fail(res.error)
  const poll = await loadGuestPoll(token)
  return poll ? ok(poll) : fail('This link is invalid or expired.')
}
