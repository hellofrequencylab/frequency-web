'use server'

// /create-a-space, the last move: save what the visitor built and claim the handle. Three entries, one per way in,
// and none of them is a new sign-in system. The email path is the beta entry's own send (sendSignupLink: same
// throttle buckets, same bare callback, same post-sign-in cookie), the Google path is signInWithGoogle, and a member
// who is already signed in skips the account altogether. What differs is only the hand-over: the draft goes into the
// launch hold (lib/launch/pending-io.ts, a cookie) before sign-in, so the launch page prefills from it afterwards.
//
// No database write happens here. The Space is made on the launch page when the visitor publishes their Spotlight.
// The one table read is the handle check, answered as taken or not and nothing more, repeated here because the
// browser's earlier "It's free" may be minutes old. Every entry has one destination, /launch/claim (then /launch).

import { redirect } from 'next/navigation'
import { signInWithGoogle, sendSignupLink } from '@/app/sign-in/actions'
import { getMyProfileId } from '@/lib/auth'
import { claimedHandle } from '@/lib/create-space/builder'
import { destinationFor, holdFor, parseHandoff } from '@/lib/create-space/handoff'
import { launchSystemEnabled } from '@/lib/launch/enabled'
import { writePendingLaunch } from '@/lib/launch/pending-io'
import { isSpaceSlugTaken } from '@/lib/spaces/store'

export type ClaimResult = { ok: true; email: string; keepBuildingHref: string | null } | { ok: false; error: string }

const DRAFT_LOST = 'We could not read that. Check your name and handle, then try again.'
const HANDLE_TAKEN = 'That handle was just taken. Pick another and try again.'

type Handed = { next: string; keepBuildingHref: string | null } | { error: string }

/** The draft cut to its closed shape, its handle checked once more, and (when the launch is open) the hold written. */
async function handOver(raw: FormDataEntryValue | null): Promise<Handed> {
  const draft = parseHandoff(raw)
  if (!draft) return { error: DRAFT_LOST }
  // Only a read that SAYS the handle is taken stops the hand-over: a failed read (null) is not a reason to lose the visitor.
  if ((await isSpaceSlugTaken(claimedHandle(draft)).catch(() => null)) === true) return { error: HANDLE_TAKEN }
  const where = destinationFor(launchSystemEnabled())
  await writePendingLaunch(holdFor(draft))
  return { next: where.next, keepBuildingHref: where.keepBuildingHref }
}

/** "Send my magic link". Returns, so the page can show the saved state while the email travels. */
// authz-ok: public by design, it is a sign-in door. The send is sendSignupLink (per-IP and per-mailbox throttles); the one read is whether a handle is taken, as a yes or no; the one write is the caller's own httpOnly hold cookie.
export async function claimWithEmail(formData: FormData): Promise<ClaimResult> {
  const email = String(formData.get('email') ?? '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { ok: false, error: 'Enter a full email address.' }
  const handed = await handOver(formData.get('draft'))
  if ('error' in handed) return { ok: false, error: handed.error }
  const send = new FormData()
  send.set('email', email)
  send.set('next', handed.next)
  const sent = await sendSignupLink(send)
  return sent.ok ? { ok: true, email, keepBuildingHref: handed.keepBuildingHref } : { ok: false, error: sent.error }
}

/** "Continue with Google". Ends in a redirect to Google, so it is a plain form action. A bad draft goes back to the page. */
// authz-ok: public by design, it is a sign-in door. The redirect is signInWithGoogle (per-IP throttle); the only write is the caller's own httpOnly hold cookie.
export async function claimWithGoogle(formData: FormData): Promise<void> {
  const handed = await handOver(formData.get('draft'))
  if ('error' in handed) redirect('/create-a-space#get-started')
  const send = new FormData()
  send.set('next', handed.next)
  await signInWithGoogle(send)
}

/** A member who is already signed in: no account step. Their answers go into the hold and they land on the launch page
 *  via /launch/claim. Returns the address so the page can clear the local draft first. */
export async function continueSignedIn(formData: FormData): Promise<{ ok: true; href: string } | { ok: false; error: string }> {
  if (!(await getMyProfileId())) return { ok: false, error: 'Your session ended. Sign in and try again.' }
  const handed = await handOver(formData.get('draft'))
  return 'error' in handed ? { ok: false, error: handed.error } : { ok: true, href: handed.next }
}
