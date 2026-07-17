'use server'

// Token-authorised "Manage emails" preference actions. Reached from the footer "Manage emails" link,
// which carries the SAME (profileId, category) HMAC token as the one-click unsubscribe. The token in the
// URL is the authorisation (no login) — every action re-verifies it before writing. Mirrors the patterns in
// app/unsubscribe/actions.ts (verify-then-upsert, fail-closed, never reveal whether the profile exists).

import { createAdminClient } from '@/lib/supabase/admin'
import { verifyUnsubscribeToken } from '@/lib/unsubscribe-tokens'
import {
  DEFAULT_PREFERENCES,
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationPreferences,
} from '@/lib/notification-preferences'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Flip email_<category> on/off for the token's profile, verifying the HMAC token FIRST. The token is minted
// for one (profileId, tokenCategory) pair (the send uses 'lifecycle'); possessing it proves the recipient
// owns this inbox, so the manage page lets them adjust ANY email category from it. Idempotent. Never reveals
// whether the profile exists — a bad token and an unknown profile return the same error.
export async function setEmailCategoryPreference(params: {
  profileId: string
  /** The category the token was minted for (the `c` URL param), used to verify authorisation. */
  tokenCategory: string
  token: string
  /** The category being toggled (may differ from tokenCategory). */
  category: string
  subscribed: boolean
}): Promise<ActionResult<{ category: NotificationCategory; subscribed: boolean }>> {
  const { profileId, tokenCategory, token, category, subscribed } = params

  if (!(NOTIFICATION_CATEGORIES as readonly string[]).includes(tokenCategory)) {
    return fail('This link is invalid or expired.')
  }
  if (!verifyUnsubscribeToken(profileId, tokenCategory as NotificationCategory, token)) {
    return fail('This link is invalid or expired.')
  }
  if (!(NOTIFICATION_CATEGORIES as readonly string[]).includes(category)) {
    return fail('Unknown email type.')
  }

  const cat = category as NotificationCategory
  const key = `email_${cat}` as keyof NotificationPreferences

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('notification_preferences')
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle()

  const next = existing
    ? { ...(existing as unknown as NotificationPreferences), [key]: subscribed }
    : { ...DEFAULT_PREFERENCES, [key]: subscribed }

  // DEFAULT_PREFERENCES carries the Phase 6 *_comments columns, not in the generated DB types yet (ADR-246);
  // route the write through the untyped cast, same as app/unsubscribe/actions.ts.
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const { error } = await (admin as any)
    .from('notification_preferences')
    .upsert({ profile_id: profileId, ...next }, { onConflict: 'profile_id' })

  if (error) {
    console.error('[manage-emails] upsert:', error.message)
    return fail('Could not save your preference. Please try again.')
  }

  return ok({ category: cat, subscribed })
}
