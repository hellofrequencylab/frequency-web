'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { verifyUnsubscribeToken } from '@/lib/unsubscribe-tokens'
import {
  DEFAULT_PREFERENCES,
  type NotificationCategory,
  type NotificationPreferences,
} from '@/lib/notification-preferences'
import { type ActionResult, ok, fail } from '@/lib/action-result'

const VALID_CATEGORIES: NotificationCategory[] = [
  'dispatches', 'events', 'mentions', 'lifecycle',
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

  const { error } = await admin
    .from('notification_preferences')
    .upsert({ profile_id: profileId, ...next }, { onConflict: 'profile_id' })

  if (error) {
    console.error('[unsubscribe] upsert:', error.message)
    return fail('Could not save your preference. Please try again.')
  }

  return ok({ category: cat })
}
