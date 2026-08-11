'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  type NotificationSettings,
  DEFAULT_SETTINGS,
  NOTIFICATION_FREQUENCIES,
  type NotificationFrequency,
} from '@/lib/notification-preferences'
import { recordConsent } from '@/lib/consent/consent'
import { CONSENT_SCOPES, type ConsentScope } from '@/lib/consent/scopes'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Saves the notification preferences form. Upserts (lazy-create on first save).
// The payload is the full Phase 6 settings object, but only ONE half of it is
// authored by the member today: the channel × category grid (including the
// `comments` topic), which the form toggles live. The per-category `freq_*`
// cadence has no UI control any more — the form's Frequency column was removed —
// so those values ride along unchanged from `initial`, which section.tsx merges
// over DEFAULT_SETTINGS before rendering. Sending the whole object is what keeps
// that round-trip lossless: a partial payload would blank the columns on save.
// Unknown frequency values are still coerced to 'realtime' server-side, so a
// tampered payload can never widen delivery even though nothing legitimate sets
// them. RLS covers both operations: profiles self-read + notification_preferences
// owner INSERT/UPDATE (see ADR-174).
export async function saveNotificationPreferences(
  settings: NotificationSettings,
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Not signed in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) return fail('No profile')

  const clean = sanitizeSettings(settings)

  // The full Phase 6 grid (channel × category, incl. `practice`, plus freq_*) is in the
  // generated DB types, so the write goes through the typed client.
  const { error } = await supabase
    .from('notification_preferences')
    .upsert(
      { ...clean, profile_id: profile.id },
      { onConflict: 'profile_id' },
    )

  if (error) return fail(error.message)

  revalidatePath('/settings/notifications')
  revalidatePath('/settings') // the section now renders on the unified Settings page
  return ok()
}

// Coerce every frequency field to a known cadence; pass the boolean grid through
// (Supabase rejects unknown keys, so only declared columns land).
function sanitizeSettings(settings: NotificationSettings): NotificationSettings {
  const coerce = (v: unknown): NotificationFrequency =>
    (NOTIFICATION_FREQUENCIES as readonly string[]).includes(v as string)
      ? (v as NotificationFrequency)
      : 'realtime'
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    freq_dispatches: coerce(settings.freq_dispatches),
    freq_events: coerce(settings.freq_events),
    freq_mentions: coerce(settings.freq_mentions),
    freq_lifecycle: coerce(settings.freq_lifecycle),
    freq_comments: coerce(settings.freq_comments),
    freq_practice: coerce(settings.freq_practice),
  }
}

// Record a consent-scope choice (Phase 6: surfaces the ledger-only consent scopes as
// UI toggles). Append-only via the consent ledger (lib/consent) — source 'member'.
// Only the member-controllable scopes are writable here; email_lifecycle is governed
// by the per-category unsubscribe, not this toggle.
const UI_CONSENT_SCOPES: ConsentScope[] = ['email_marketing', 'ai_memory', 'analytics']

export async function saveConsentScope(
  scope: ConsentScope,
  granted: boolean,
): Promise<ActionResult> {
  if (!UI_CONSENT_SCOPES.includes(scope)) return fail('Unknown consent setting')
  if (!CONSENT_SCOPES.some((s) => s.key === scope)) return fail('Unknown consent setting')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Not signed in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return fail('No profile')

  try {
    await recordConsent(profile.id, scope, granted, 'member')
  } catch {
    return fail('Could not save. Try again.')
  }

  revalidatePath('/settings/notifications')
  revalidatePath('/settings') // the section now renders on the unified Settings page
  return ok()
}
