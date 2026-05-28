// Notification preferences helper.
//
// Reads from `notification_preferences` (one row per profile). Missing-row
// case returns the canonical defaults — opt-in for email + inapp, off for
// push (P1.4 hasn't shipped yet). This lazy-create pattern avoids the need
// to backfill every existing profile when the table ships.
//
// All reads use the admin client because the caller is typically a server
// action sending email/in-app, not the user themselves. RLS still protects
// direct client reads via /settings/notifications.

import { createAdminClient } from '@/lib/supabase/admin'

export type NotificationCategory =
  | 'dispatches'
  | 'events'
  | 'mentions'
  | 'lifecycle'

export type NotificationChannel = 'email' | 'inapp' | 'push'

export type NotificationPreferences = {
  email_dispatches: boolean
  email_events:     boolean
  email_mentions:   boolean
  email_lifecycle:  boolean
  inapp_dispatches: boolean
  inapp_events:     boolean
  inapp_mentions:   boolean
  inapp_lifecycle:  boolean
  push_dispatches:  boolean
  push_events:      boolean
  push_mentions:    boolean
  push_lifecycle:   boolean
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  email_dispatches: true,
  email_events:     true,
  email_mentions:   true,
  email_lifecycle:  true,
  inapp_dispatches: true,
  inapp_events:     true,
  inapp_mentions:   true,
  inapp_lifecycle:  true,
  push_dispatches:  false,
  push_events:      false,
  push_mentions:    false,
  push_lifecycle:   false,
}

export async function getPreferences(profileId: string): Promise<NotificationPreferences> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('notification_preferences')
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle()

  if (!data) return DEFAULT_PREFERENCES
  return data as unknown as NotificationPreferences
}

// Channel × category gate. Used at send sites:
//
//   if (!await shouldSend(recipientId, 'email', 'dispatches')) return
//
// Returns false on any error so a broken pref read never accidentally
// spams a user. (False-positive opt-out > false-negative opt-in.)
export async function shouldSend(
  profileId: string,
  channel: NotificationChannel,
  category: NotificationCategory,
): Promise<boolean> {
  try {
    const prefs = await getPreferences(profileId)
    const key = `${channel}_${category}` as keyof NotificationPreferences
    return prefs[key]
  } catch {
    return false
  }
}
