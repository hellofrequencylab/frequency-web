// The contact-preference TOPIC VOCABULARY — the keys a contact can tune, and nothing that can
// reach a database.
//
// Split out of lib/comms/contact-preferences.ts (LIVE-037). The preference reads/writes there go
// through the service-role admin client; this one constant is all the send-time normalizer and
// the space email composer need. They shared a module, so composer-shell.tsx ('use client')
// importing EMAIL_TOPIC_OPTIONS reached lib/spaces/email-topics -> contact-preferences and pulled
// the RLS-bypassing Supabase client into the composer's browser bundle.
//
// This was the ELEVENTH path of a class the backlog row enumerated as ten, and it is why the row
// now probes reachability instead of a hand-kept list (scripts/check-client-server-boundary.mjs).
//
// Re-exported from lib/comms/contact-preferences.ts, so every server caller is unchanged.
// CLIENT code must import from HERE.

import type { NotificationTopic } from '@/lib/notification-preferences'

export type ContactPreferenceState = 'subscribed' | 'unsubscribed'

// The topics a contact can tune from a Space's preference center. Kept explicit (not
// the whole NotificationTopic union) because a contact only ever hears a Space's
// outbound email: broadcasts, event updates, and marketing.
export const CONTACT_TOPICS: readonly NotificationTopic[] = ['dispatches', 'events', 'marketing'] as const
