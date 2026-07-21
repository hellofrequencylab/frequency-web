// The topic a space email is tagged with (ADR-799 Decision C). One source of truth for the operator-
// facing topic options and the send-time normalizer, so the composer, the send seam, and the scheduled
// path all agree.
//
// The keys REUSE the contact preference topics (CONTACT_TOPICS in lib/comms/contact-preferences) — a
// contact who muted a topic in the preference center is gated on the matching send. We do NOT invent new
// keys. Only the operator-facing display labels are added here (the composer labels the axis
// Marketing / Event update / Announcement, mapping onto marketing / events / dispatches).

import type { NotificationTopic } from '@/lib/notification-preferences'
import { CONTACT_TOPICS } from '@/lib/comms/contact-preferences'

/** The default topic. A campaign with no explicit topic sends exactly as the pre-topic path did (the
 *  send loop only ever gated on 'marketing'), so back-compat is byte-identical. */
export const DEFAULT_EMAIL_TOPIC: NotificationTopic = 'marketing'

export interface EmailTopicOption {
  key: NotificationTopic
  label: string
  help: string
}

/** The ordered topic options the composer offers. Labels are sentence case, no em dashes (voice canon). */
export const EMAIL_TOPIC_OPTIONS: readonly EmailTopicOption[] = [
  { key: 'marketing', label: 'Marketing', help: 'Offers and news. Contacts who muted this topic will not get it.' },
  { key: 'events', label: 'Event update', help: 'Reminders and changes for an event. Contacts who muted event updates will not get it.' },
  { key: 'dispatches', label: 'Announcement', help: 'A general update from your space. Contacts who muted announcements will not get it.' },
] as const

/** Coerce an unknown value to a valid contact topic, defaulting to marketing. Fail-safe: an absent,
 *  legacy, or malformed topic behaves exactly as the pre-topic send did. */
export function normalizeEmailTopic(value: unknown): NotificationTopic {
  return typeof value === 'string' && (CONTACT_TOPICS as readonly string[]).includes(value)
    ? (value as NotificationTopic)
    : DEFAULT_EMAIL_TOPIC
}
