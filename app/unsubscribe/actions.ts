'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { verifyUnsubscribeToken, verifySpaceUnsubscribeToken } from '@/lib/unsubscribe-tokens'
import { suppress } from '@/lib/suppression'
import {
  DEFAULT_PREFERENCES,
  type NotificationCategory,
  type NotificationPreferences,
  type NotificationTopic,
} from '@/lib/notification-preferences'
import {
  setContactChannelPreference,
  CONTACT_TOPICS,
} from '@/lib/comms/contact-preferences'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Every preference category a one-click link may target. Must stay in sync with NOTIFICATION_CATEGORIES
// and the /manage-emails toggles — 'comments' was missing, so a comments unsubscribe link silently no-oped
// (the API route 200s regardless). 'transactional' is deliberately absent: account/security mail is not
// unsubscribable.
const VALID_CATEGORIES: NotificationCategory[] = [
  'dispatches', 'events', 'mentions', 'comments', 'lifecycle',
]

// Flip email_<category> to false for the given profile, verifying the
// HMAC token first. Idempotent: re-running has no additional effect.
//
// Returns { ok: true, category } on success, otherwise an error string.
// Never reveals whether the profile_id exists — invalid token and unknown
// profile both return the same error.
export async function processUnsubscribe(params: {
  profileId: string
  category:  string
  token:     string
}): Promise<ActionResult<{ category: NotificationCategory }>> {
  const { profileId, category, token } = params

  if (!(VALID_CATEGORIES as string[]).includes(category)) {
    return fail('Unknown category.')
  }
  const cat = category as NotificationCategory

  if (!verifyUnsubscribeToken(profileId, cat, token)) {
    return fail('This unsubscribe link is invalid or expired.')
  }

  const admin = createAdminClient()
  const key = `email_${cat}` as keyof NotificationPreferences

  // Read existing row (if any) so we can preserve other settings during upsert.
  const { data: existing } = await admin
    .from('notification_preferences')
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle()

  const next = existing
    ? { ...(existing as unknown as NotificationPreferences), [key]: false }
    : { ...DEFAULT_PREFERENCES, [key]: false }

  // DEFAULT_PREFERENCES now carries the Phase 6 *_comments columns, which aren't in the
  // generated DB types yet (ADR-246); route the write through the untyped cast.
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const { error } = await (admin as any)
    .from('notification_preferences')
    .upsert({ profile_id: profileId, ...next }, { onConflict: 'profile_id' })

  if (error) {
    console.error('[unsubscribe] upsert:', error.message)
    return fail('Could not save your preference. Please try again.')
  }

  return ok({ category: cat })
}

// Per-Space one-click unsubscribe (ENTITY-SPACES-BUILD Phase 3). Verifies the (spaceId, email)
// HMAC token, then records a SPACE-SCOPED suppression so the recipient stops hearing from THAT
// Space only (never the whole platform). Idempotent: re-running adds nothing. Never reveals whether
// the Space or address exists; a bad token and an unknown pair return the same error.
export async function processSpaceUnsubscribe(params: {
  spaceId: string
  email:   string
  token:   string
}): Promise<ActionResult<{ scope: 'space' }>> {
  const { spaceId, email, token } = params

  if (!spaceId || !email) {
    return fail('This unsubscribe link is invalid or expired.')
  }
  if (!verifySpaceUnsubscribeToken(spaceId, email, token)) {
    return fail('This unsubscribe link is invalid or expired.')
  }

  try {
    await suppress(email, 'unsubscribe', spaceId)
  } catch (err) {
    console.error('[unsubscribe] space suppress:', err instanceof Error ? err.message : String(err))
    return fail('Could not save your preference. Please try again.')
  }

  return ok({ scope: 'space' })
}

// Preference-center opt-down (Phase 6). Reachable from the SAME per-Space unsubscribe
// token: instead of hard-unsubscribing from a Space entirely, a contact can opt DOWN a
// single topic (e.g. keep event reminders, drop broadcasts). Verifies the (spaceId,
// email) HMAC token first — the token IS the authorisation (no login). Idempotent.
// Only the contact-facing topics (CONTACT_TOPICS) are settable here.
export async function setContactTopicPreference(params: {
  spaceId: string
  email: string
  token: string
  topic: string
  subscribed: boolean
}): Promise<ActionResult> {
  const { spaceId, email, token, topic, subscribed } = params

  if (!spaceId || !email) {
    return fail('This link is invalid or expired.')
  }
  if (!verifySpaceUnsubscribeToken(spaceId, email, token)) {
    return fail('This link is invalid or expired.')
  }
  if (!(CONTACT_TOPICS as readonly string[]).includes(topic)) {
    return fail('Unknown topic.')
  }

  const okWrite = await setContactChannelPreference({
    email,
    spaceId,
    topic: topic as NotificationTopic,
    channel: 'email',
    state: subscribed ? 'subscribed' : 'unsubscribed',
  })
  if (!okWrite) return fail('Could not save your preference. Please try again.')

  return ok()
}
