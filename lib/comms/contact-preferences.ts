// Contact-keyed channel preferences (CRM Master Build Plan Phase 6).
//
// `notification_preferences` is profile-only, but a Space also emails CONTACTS who
// may have no Frequency profile. This module is the contact side of the preference
// center: a surface keyed on the lowercased EMAIL x Space x topic x channel, so a
// non-member reached by a Space can opt DOWN a single topic ('unsubscribed') instead
// of only hard-unsubscribing (which records a Space-scoped email suppression).
//
// The Space send path consults `isContactTopicMuted` in REAL TIME at send time (a
// fresh read, like suppression). Writes go through the service-role admin client from
// the token-verified preference-center action — a contact has no login, so RLS grants
// no authenticated self-write (see the migration). `contact_channel_preferences` isn't
// in the generated DB types yet (ADR-246), so this reaches it via the untyped cast.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient } from '@/lib/supabase/admin'
import type { NotificationTopic, NotificationChannel } from '@/lib/notification-preferences'
import { recordContactInteraction } from '@/lib/crm/interactions'

export type ContactPreferenceState = 'subscribed' | 'unsubscribed'

// The topics a contact can tune from a Space's preference center. Kept explicit (not
// the whole NotificationTopic union) because a contact only ever hears a Space's
// outbound email: broadcasts, event updates, and marketing.
export const CONTACT_TOPICS: readonly NotificationTopic[] = ['dispatches', 'events', 'marketing'] as const

export interface ContactPreferenceKey {
  email: string
  /** The Space this preference is scoped to. */
  spaceId: string
  topic: NotificationTopic
  channel?: NotificationChannel // defaults to 'email' (the only channel a Space uses today)
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Real-time send-path read: has this contact opted DOWN this topic for this Space?
 * Fail-safe: any error / missing row -> false (NOT muted, i.e. subscribed). The Space
 * send path still checks the hard suppression list separately; this is the softer,
 * per-topic opt-down layered on top.
 */
export async function isContactTopicMuted(key: ContactPreferenceKey): Promise<boolean> {
  const email = normalizeEmail(key.email)
  if (!email || !key.spaceId) return false
  const channel = key.channel ?? 'email'
  try {
    const admin = createAdminClient() as any
    const { data } = await admin
      .from('contact_channel_preferences')
      .select('state')
      .eq('email', email)
      .eq('space_id', key.spaceId)
      .eq('topic', key.topic)
      .eq('channel', channel)
      .maybeSingle()
    return data?.state === 'unsubscribed'
  } catch {
    return false
  }
}

export interface ContactPreferenceRow {
  topic: NotificationTopic
  channel: NotificationChannel
  state: ContactPreferenceState
}

/**
 * Every stored preference row for (email, Space) — for the preference-center landing to
 * render current state. Absence of a row for a topic means 'subscribed' (opt-out model),
 * so the caller fills unlisted topics with the subscribed default. Fail-safe: [] on error.
 */
export async function getContactPreferences(
  email: string,
  spaceId: string,
): Promise<ContactPreferenceRow[]> {
  const addr = normalizeEmail(email)
  if (!addr || !spaceId) return []
  try {
    const admin = createAdminClient() as any
    const { data } = await admin
      .from('contact_channel_preferences')
      .select('topic, channel, state')
      .eq('email', addr)
      .eq('space_id', spaceId)
    if (!Array.isArray(data)) return []
    return data.map((r: any) => ({
      topic: r.topic as NotificationTopic,
      channel: r.channel as NotificationChannel,
      state: r.state as ContactPreferenceState,
    }))
  } catch {
    return []
  }
}

export interface SetContactPreferenceInput extends ContactPreferenceKey {
  state: ContactPreferenceState
  /** Optional linked contact/network_contact id (attribution only; the email is the key). */
  contactId?: string | null
  /** The Space owner's profile id, when known — lets us log the change to their CRM
   *  timeline as a consent audit trail. Best-effort; omit to skip logging. */
  ownerProfileId?: string | null
}

/**
 * Upsert one contact preference row (idempotent on the unique key). Returns true on
 * success. Best-effort: also logs the change to the owner's interaction timeline as a
 * consent audit trail when `ownerProfileId` + `contactId` are supplied (never blocks
 * the write, never edits the interactions module).
 */
export async function setContactChannelPreference(input: SetContactPreferenceInput): Promise<boolean> {
  const email = normalizeEmail(input.email)
  if (!email || !input.spaceId) return false
  const channel = input.channel ?? 'email'
  try {
    const admin = createAdminClient() as any
    const { error } = await admin.from('contact_channel_preferences').upsert(
      {
        email,
        space_id: input.spaceId,
        topic: input.topic,
        channel,
        state: input.state,
        contact_id: input.contactId ?? null,
      },
      { onConflict: 'email,space_id,topic,channel' },
    )
    if (error) {
      console.error('[contact-preferences] upsert:', error.message)
      return false
    }

    // Consent audit trail (best-effort). recordContactInteraction is read-only here —
    // a broken log must never fail the preference write.
    if (input.ownerProfileId && input.contactId) {
      try {
        await recordContactInteraction(
          {
            ownerProfileId: input.ownerProfileId,
            subjectKind: 'contact',
            subjectId: input.contactId,
            channel: 'system',
            direction: 'internal',
            source: 'system',
            summary: `Preference ${input.state} for ${input.topic} (${channel})`,
            metadata: { kind: 'contact_preference_change', topic: input.topic, channel, state: input.state },
          },
          input.spaceId,
        )
      } catch {
        /* audit log is best-effort */
      }
    }
    return true
  } catch (err) {
    console.error('[contact-preferences] set:', err instanceof Error ? err.message : String(err))
    return false
  }
}
