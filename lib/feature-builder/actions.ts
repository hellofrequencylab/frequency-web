'use server'

// THE FEATURE BUILDER HAND-OVER (LIVE-2481). Three ways to finish a builder, none of them a new sign-in system: a
// member who is signed in saves straight into the feature; a visitor sends themselves the beta's magic link
// (sendSignupLink) or continues with Google (signInWithGoogle). For a visitor the draft waits in the hold cookie and
// app/finish/[feature]/route.ts saves it the moment they are signed in.

import { redirect } from 'next/navigation'
import { signInWithGoogle, sendSignupLink } from '@/app/sign-in/actions'
import { getMyProfileId } from '@/lib/auth'
import { BOT_CHECK_FIELD, botCheckToken } from '@/lib/auth/bot-check'
import { feature as featureEntry, finishHref, isFeatureId, type FeatureId } from './catalog'
import { parseDraft } from './draft'
import { applyFeature } from './apply'
import { writeFeatureHold } from './hold'

const LOST = 'We could not read that. Check the steps above and try again.'

type FinishResult = { ok: true; liveHref: string | null } | { ok: false; error: string }
export type ClaimResult = { ok: true; email: string } | { ok: false; error: string }

function read(formData: FormData): { feature: FeatureId; draft: NonNullable<ReturnType<typeof parseDraft>> } | null {
  const f = formData.get('feature')
  if (!isFeatureId(f)) return null
  const draft = parseDraft(f, formData.get('draft'))
  return draft ? { feature: f, draft } : null
}

/** A signed-in member: save it now. */
export async function finishSignedIn(formData: FormData): Promise<FinishResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return { ok: false, error: 'Your session ended. Sign in and try again.' }
  const got = read(formData)
  if (!got) return { ok: false, error: LOST }
  return applyFeature(profileId, got.feature, got.draft)
}

/** "Email me a link". The draft waits in the hold; the link signs them in and lands on the finish route. */
// authz-ok: public by design, it is a sign-in door. The send is sendSignupLink (per-IP and per-mailbox throttles); the only write is the caller's own httpOnly hold cookie.
export async function claimFeatureWithEmail(formData: FormData): Promise<ClaimResult> {
  const email = String(formData.get('email') ?? '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { ok: false, error: 'Enter a full email address.' }
  const got = read(formData)
  if (!got) return { ok: false, error: LOST }
  await writeFeatureHold(got)
  const send = new FormData()
  send.set('email', email)
  send.set('next', finishHref(got.feature))
  // The invisible bot check (SEC-047) rides through: sendSignupLink refuses a send without it once the check is on.
  const token = botCheckToken(formData)
  if (token) send.set(BOT_CHECK_FIELD, token)
  const sent = await sendSignupLink(send)
  return sent.ok ? { ok: true, email } : { ok: false, error: sent.error }
}

/** "Continue with Google". Ends in a redirect to Google, so it is a plain form action. */
// authz-ok: public by design, it is a sign-in door. The redirect is signInWithGoogle (per-IP throttle); the only write is the caller's own httpOnly hold cookie.
export async function claimFeatureWithGoogle(formData: FormData): Promise<void> {
  const got = read(formData)
  if (!got) {
    const f = formData.get('feature')
    redirect(isFeatureId(f) ? `${featureEntry(f).href}?e=draft` : '/')
  }
  await writeFeatureHold(got)
  const send = new FormData()
  send.set('next', finishHref(got.feature))
  await signInWithGoogle(send)
}
