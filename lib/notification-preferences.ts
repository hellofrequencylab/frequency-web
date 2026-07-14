// Notification preferences helper.
//
// Reads from `notification_preferences` (one row per profile). Missing-row
// case returns the canonical defaults: opt-in for email + inapp, opt-OUT for
// push. Push is live (see lib/push.ts), but it stays off by default because it
// needs an explicit browser-permission grant before it can deliver, so a member
// opts in rather than starting subscribed. This lazy-create pattern avoids the
// need to backfill every existing profile when the table ships.
//
// All reads use the admin client because the caller is typically a server
// action sending email/in-app, not the user themselves. RLS still protects
// direct client reads via /settings/notifications.

import { createAdminClient } from '@/lib/supabase/admin'

// The preference categories (topics) that carry a per-channel grid + frequency.
// `comments` (replies + mentions on your OWN posts) was added in Phase 6 (CRM
// Master Build Plan §Phase 6). `marketing` is NOT here — it is governed by the
// consent ledger (`email_marketing` scope), not the per-category toggle, so it
// lives in the wider `NotificationTopic` union below and in send-gate's SendCategory.
export type NotificationCategory =
  | 'dispatches'
  | 'events'
  | 'mentions'
  | 'lifecycle'
  | 'comments'

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  'dispatches',
  'events',
  'mentions',
  'lifecycle',
  'comments',
] as const

// The full topic vocabulary the preference model + per-subject/contact surfaces speak
// (a superset of NotificationCategory that also includes consent-governed `marketing`).
export type NotificationTopic = NotificationCategory | 'marketing'

export type NotificationChannel = 'email' | 'inapp' | 'push'

// Per-category delivery cadence (Phase 6). `realtime` is the historical behaviour
// (send on each event). A digest choice DEFERS the realtime send — the gate suppresses
// it and a digest cron batches it (see lib/comms/send-gate.ts frequencyDeferred seam).
export type NotificationFrequency = 'realtime' | 'daily_digest' | 'weekly_digest'

export const NOTIFICATION_FREQUENCIES: readonly NotificationFrequency[] = [
  'realtime',
  'daily_digest',
  'weekly_digest',
] as const

export type NotificationPreferences = {
  email_dispatches: boolean
  email_events:     boolean
  email_mentions:   boolean
  email_lifecycle:  boolean
  email_comments:   boolean
  inapp_dispatches: boolean
  inapp_events:     boolean
  inapp_mentions:   boolean
  inapp_lifecycle:  boolean
  inapp_comments:   boolean
  push_dispatches:  boolean
  push_events:      boolean
  push_mentions:    boolean
  push_lifecycle:   boolean
  push_comments:    boolean
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  email_dispatches: true,
  email_events:     true,
  email_mentions:   true,
  email_lifecycle:  true,
  email_comments:   true,
  inapp_dispatches: true,
  inapp_events:     true,
  inapp_mentions:   true,
  inapp_lifecycle:  true,
  inapp_comments:   true,
  push_dispatches:  false,
  push_events:      false,
  push_mentions:    false,
  push_lifecycle:   false,
  push_comments:    false,
}

// Per-category frequency map (one `freq_<category>` per NotificationCategory). Kept
// separate from the boolean grid so the historical NotificationPreferences shape is
// unchanged for existing callers; the DB row carries both (same table).
export type CategoryFrequencies = Record<`freq_${NotificationCategory}`, NotificationFrequency>

export const DEFAULT_FREQUENCIES: CategoryFrequencies = {
  freq_dispatches: 'realtime',
  freq_events:     'realtime',
  freq_mentions:   'realtime',
  freq_lifecycle:  'realtime',
  freq_comments:   'realtime',
}

// The combined shape the settings form round-trips (grid + frequency), one upsert.
export type NotificationSettings = NotificationPreferences & CategoryFrequencies

export const DEFAULT_SETTINGS: NotificationSettings = {
  ...DEFAULT_PREFERENCES,
  ...DEFAULT_FREQUENCIES,
}

export async function getPreferences(profileId: string): Promise<NotificationPreferences> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('notification_preferences')
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle()

  if (!data) return DEFAULT_PREFERENCES
  // Merge over defaults so a row written before the Phase 6 columns shipped (no
  // *_comments key) still resolves every category to its canonical default.
  return { ...DEFAULT_PREFERENCES, ...(data as unknown as Partial<NotificationPreferences>) }
}

// Read the member's per-category delivery cadence. Missing row / missing columns /
// any error -> all `realtime` (today's behaviour), so this is safe on a pre-Phase-6
// row and never accidentally defers a send.
export async function getFrequencies(profileId: string): Promise<CategoryFrequencies> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('notification_preferences')
      .select('*')
      .eq('profile_id', profileId)
      .maybeSingle()
    if (!data) return { ...DEFAULT_FREQUENCIES }
    const row = data as unknown as Partial<CategoryFrequencies>
    return {
      freq_dispatches: normalizeFrequency(row.freq_dispatches),
      freq_events:     normalizeFrequency(row.freq_events),
      freq_mentions:   normalizeFrequency(row.freq_mentions),
      freq_lifecycle:  normalizeFrequency(row.freq_lifecycle),
      freq_comments:   normalizeFrequency(row.freq_comments),
    }
  } catch {
    return { ...DEFAULT_FREQUENCIES }
  }
}

/** One category's cadence. Fail-safe: any error -> 'realtime' (never defers on a broken read). */
export async function getFrequency(
  profileId: string,
  category: NotificationCategory,
): Promise<NotificationFrequency> {
  const freqs = await getFrequencies(profileId)
  return freqs[`freq_${category}` as keyof CategoryFrequencies] ?? 'realtime'
}

/** Pure: coerce an untrusted stored value to a known cadence, defaulting to 'realtime'. */
export function normalizeFrequency(value: unknown): NotificationFrequency {
  return (NOTIFICATION_FREQUENCIES as readonly string[]).includes(value as string)
    ? (value as NotificationFrequency)
    : 'realtime'
}

/**
 * Whether a realtime send should be DEFERRED to a digest for this category. Pure so the
 * gate + tests can reason about it without IO. Digests only apply to email today (in-app
 * + push are inherently realtime surfaces); a non-email channel is never deferred.
 *
 * SEAM: when this returns true the gate suppresses the realtime send and expects a digest
 * cron to batch the category later. The batching job is a follow-up — until it ships, a
 * member on 'daily_digest' simply receives fewer realtime emails for that category. This is
 * deliberately fail-safe: over-quieting, never over-sending.
 */
export function isFrequencyDeferred(
  channel: NotificationChannel,
  frequency: NotificationFrequency,
): boolean {
  return channel === 'email' && frequency !== 'realtime'
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

// ── Per-Space / per-circle topic mutes (Phase 6) ─────────────────────────────
// A member can silence ONE Space or Circle for ONE topic on ONE channel without
// touching their global grid. Stored in `subject_topic_preferences` as explicit
// muted=true rows (absence = not muted). The send path consults `isSubjectTopicMuted`
// on top of the global `shouldSend` check. Table isn't in the generated types yet
// (ADR-246), so the read uses the untyped admin-client cast.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type PreferenceSubjectType = 'space' | 'circle'

export interface PreferenceSubject {
  subjectType: PreferenceSubjectType
  subjectId: string
}

/**
 * True when the member has explicitly muted (topic, channel) for this Space/Circle.
 * Fail-safe: any error / missing row -> false (NOT muted). Over-quieting a whole
 * platform because one read broke would be worse than delivering one subject's
 * notification; the wider gate stays fail-closed on the send decision itself.
 */
export async function isSubjectTopicMuted(
  profileId: string,
  subject: PreferenceSubject,
  topic: NotificationTopic,
  channel: NotificationChannel,
): Promise<boolean> {
  try {
    const admin = createAdminClient() as any
    const { data } = await admin
      .from('subject_topic_preferences')
      .select('muted')
      .eq('profile_id', profileId)
      .eq('subject_type', subject.subjectType)
      .eq('subject_id', subject.subjectId)
      .eq('topic', topic)
      .eq('channel', channel)
      .maybeSingle()
    return data?.muted === true
  } catch {
    return false
  }
}

/** All of a member's per-subject mute rows (for the settings UI to render current state). */
export async function listSubjectMutes(
  profileId: string,
): Promise<{ subjectType: PreferenceSubjectType; subjectId: string; topic: NotificationTopic; channel: NotificationChannel }[]> {
  try {
    const admin = createAdminClient() as any
    const { data } = await admin
      .from('subject_topic_preferences')
      .select('subject_type, subject_id, topic, channel, muted')
      .eq('profile_id', profileId)
      .eq('muted', true)
    if (!Array.isArray(data)) return []
    return data.map((r: any) => ({
      subjectType: r.subject_type as PreferenceSubjectType,
      subjectId: String(r.subject_id),
      topic: r.topic as NotificationTopic,
      channel: r.channel as NotificationChannel,
    }))
  } catch {
    return []
  }
}

/** Set (or clear) a per-subject topic mute. Idempotent upsert; muted=false deletes the row. */
export async function setSubjectTopicMute(
  profileId: string,
  subject: PreferenceSubject,
  topic: NotificationTopic,
  channel: NotificationChannel,
  muted: boolean,
): Promise<boolean> {
  try {
    const admin = createAdminClient() as any
    if (!muted) {
      const { error } = await admin
        .from('subject_topic_preferences')
        .delete()
        .eq('profile_id', profileId)
        .eq('subject_type', subject.subjectType)
        .eq('subject_id', subject.subjectId)
        .eq('topic', topic)
        .eq('channel', channel)
      return !error
    }
    const { error } = await admin.from('subject_topic_preferences').upsert(
      {
        profile_id: profileId,
        subject_type: subject.subjectType,
        subject_id: subject.subjectId,
        topic,
        channel,
        muted: true,
      },
      { onConflict: 'profile_id,subject_type,subject_id,topic,channel' },
    )
    return !error
  } catch {
    return false
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
