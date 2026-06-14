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

// ── SMS channel preferences (EVENTS-REWORK §5 / ADR-256) ─────────────────────
// SMS is a separate, hard-gated channel: it never sends until the legal track is
// live (see lib/comms/sms.ts). These readers are additive — the `sms_*` columns
// (added in 20260626010000_sms_groundwork, not applied / not in database.types
// yet) default OFF, so until a member explicitly opts in everything below returns
// the safe "off / legal-default" values. Cast convention for the new columns.

// SMS only carries the two host-driven event categories (ADR-255: "text the group"
// is an Event Dispatch channel). Lifecycle/mentions never go to SMS.
export type SmsCategory = 'dispatches' | 'events'

// The legal default quiet-hours window: 8am-9pm local. Used when a row is missing
// or the columns are not yet present, and as the clamp the guard never widens past.
const DEFAULT_SMS_QUIET = { startHour: 8, endHour: 21 } as const

type SmsPreferenceRow = {
  sms_enabled?: boolean | null
  sms_dispatches?: boolean | null
  sms_events?: boolean | null
  sms_quiet_start_hour?: number | null
  sms_quiet_end_hour?: number | null
}

async function getSmsPreferenceRow(profileId: string): Promise<SmsPreferenceRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('notification_preferences')
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle()
  return (data as unknown as SmsPreferenceRow | null) ?? null
}

// True only when the master SMS switch AND this category's SMS toggle are both on.
// Missing row / missing columns -> false (SMS is opt-IN; the default is off). The
// guard in lib/comms/sms.ts still requires consent + provisioning + quiet hours on
// top of this. Fail-closed so a broken read never enables SMS.
export async function isSmsEnabled(profileId: string, category: SmsCategory): Promise<boolean> {
  try {
    const row = await getSmsPreferenceRow(profileId)
    if (!row || row.sms_enabled !== true) return false
    const key = `sms_${category}` as 'sms_dispatches' | 'sms_events'
    return row[key] === true
  } catch {
    return false
  }
}

// The member's SMS quiet-hours window (local time), clamped to the legal 8am-9pm
// bound — a member may narrow it but never widen past the statutory window. Missing
// row / columns / any error -> the legal default. The guard evaluates the current
// local hour against this.
export async function smsQuietHours(
  profileId: string,
): Promise<{ startHour: number; endHour: number }> {
  try {
    const row = await getSmsPreferenceRow(profileId)
    const start = row?.sms_quiet_start_hour
    const end = row?.sms_quiet_end_hour
    if (start == null || end == null) return { ...DEFAULT_SMS_QUIET }
    // Clamp inside the legal window: never start earlier than 8am, never end later
    // than 9pm. A member can only shrink the sending window, never extend it.
    return {
      startHour: Math.max(DEFAULT_SMS_QUIET.startHour, start),
      endHour: Math.min(DEFAULT_SMS_QUIET.endHour, end),
    }
  } catch {
    return { ...DEFAULT_SMS_QUIET }
  }
}
