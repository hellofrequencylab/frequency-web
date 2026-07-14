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
// The payload now carries the full Phase 6 settings: the channel × category grid
// (including the `comments` topic) PLUS the per-category `freq_*` cadence. Push
// columns are accepted as-is (the UI toggles them live). Unknown frequency values
// are coerced to 'realtime' server-side so a tampered payload can never widen
// delivery. RLS covers both operations: profiles self-read + notification_preferences
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

  // The Phase 6 columns (*_comments, freq_*) are not in the generated DB types yet
  // (ADR-246), so route the write through the untyped cast rather than regenerate types.
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const { error } = await (supabase as any)
    .from('notification_preferences')
    .upsert(
      { profile_id: profile.id, ...clean },
      { onConflict: 'profile_id' },
    )

  if (error) return fail(error.message)

  revalidatePath('/settings/notifications')
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
  return ok()
}
