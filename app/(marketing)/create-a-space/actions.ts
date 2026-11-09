'use server'

// /create-a-space, the last move: save what the visitor built and claim the handle. Three entries, one per way in,
// and none of them is a new sign-in system. The email path is the beta entry's own send (sendSignupLink: same
// throttle buckets, same bare callback, same post-sign-in cookie), the Google path is signInWithGoogle, and a member
// who is already signed in skips the account altogether. What differs is only the hand-over: the draft goes into the
// launch hold (lib/launch/pending-io.ts, a cookie) before sign-in, so the launch page prefills from it afterwards.
//
// The Space is not made here. It is made on the launch page when the visitor publishes their Spotlight. The one table
// read on the hand-over is the handle check, answered as taken or not and nothing more, repeated here because the
// browser's earlier "It's free" may be minutes old. Every entry has one destination, /launch/claim (then /launch).
//
// Two more doors since ADR-1933 (LIVE-1967): saveDraftLead keeps the draft server-side once step 3 has an address
// (the browser calls it after every change from then on, and the beacon route on pagehide), and restoreDraft reads it
// back for a ?draft= link. Both live in lib/create-space/draft-io.ts; here is only the rate limit, the honeypot and
// the shapes. The saved draft is the come-back the reminder emails (LIVE-1968) point at.

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { signInWithGoogle, sendSignupLink } from '@/app/sign-in/actions'
import { getMyProfileId } from '@/lib/auth'
import { claimedHandle } from '@/lib/create-space/builder'
import { readDraftByToken, saveDraft } from '@/lib/create-space/draft-io'
import { destinationFor, holdFor, parseHandoff } from '@/lib/create-space/handoff'
import { isLeadToken, isZone } from '@/lib/create-space/lead'
import { launchSystemEnabled } from '@/lib/launch/enabled'
import { writePendingLaunch } from '@/lib/launch/pending-io'
import { rateLimitOk } from '@/lib/rate-limit'
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
  // The server copy is NOT stamped converted here: a tap on Claim is not an arrival. The hold carries the draft's token,
  // and /launch/claim stamps it the moment the person has signed in (the owner's rule, 2026-11-03: an abandoned claim,
  // a magic link never opened or a Google sign-in never finished, still gets the come-back emails, ADR-1933).
  await writePendingLaunch(holdFor(draft))
  return { next: where.next, keepBuildingHref: where.keepBuildingHref }
}

/** The caller's address for the throttles, the way lead-actions.ts reads it. */
async function callerIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
}

/** Top of the funnel: an unconfigured limiter lets the save through (a denied save loses the lead for good; a
 *  duplicate row costs one upsert), a configured one is honoured. Same reasoning as the induction's capture. */
const FUNNEL = { whenUnconfigured: 'allow' } as const

export type SaveDraftLeadResult = { ok: true; token: string; handleTaken: boolean } | { ok: false }

/** Keep the draft server-side under its address. Fields: draft (the browser's JSON), token (the one it holds, if any),
 *  tz (the browser's zone), own (1 when a picture of theirs is in play), website (the honeypot; filled means no save). */
// authz-ok: public by design, it is the lead door of a signed-out funnel. Throttled per IP and per mailbox; a filled honeypot writes nothing. The write is saveDraft (lib/create-space/draft-io.ts): bound to the token hash the browser holds, or a new row with a fresh token, and the address goes through the anon-granted capture_signup_lead RPC. It returns the token and a yes or no on the handle, nothing about the address.
export async function saveDraftLead(formData: FormData): Promise<SaveDraftLeadResult> {
  if (String(formData.get('website') ?? '').length > 0) return { ok: false }
  const draft = parseHandoff(formData.get('draft'))
  if (!draft) return { ok: false }
  const email = draft.email.trim().toLowerCase()
  if (!email) return { ok: false }
  if (!(await rateLimitOk('create-space-draft', await callerIp(), 30, '10 m', FUNNEL))) return { ok: false }
  if (!(await rateLimitOk('create-space-draft-mail', email, 20, '1 h', FUNNEL))) return { ok: false }
  const rawToken = formData.get('token')
  const rawTz = formData.get('tz')
  const saved = await saveDraft({
    draft,
    token: isLeadToken(rawToken) ? rawToken : null,
    tz: isZone(rawTz) ? rawTz : null,
    ownPhoto: formData.get('own') === '1',
  })
  return saved ? { ok: true, ...saved } : { ok: false }
}

/** The draft behind a ?draft= link, as JSON for the browser's reader, or null. Never restored by itself: the page
 *  shows "Welcome back" and the visitor picks it up. */
// authz-ok: public by design, a resume link. Throttled per IP. The read is readDraftByToken (lib/create-space/draft-io.ts): the draft JSON for a token of the right shape whose hash matches a row, else null, so it says nothing about any address. A converted draft answers null.
export async function restoreDraft(token: string): Promise<{ draft: string | null }> {
  if (!isLeadToken(token)) return { draft: null }
  if (!(await rateLimitOk('create-space-restore', await callerIp(), 20, '10 m', FUNNEL))) return { draft: null }
  return { draft: await readDraftByToken(token) }
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
