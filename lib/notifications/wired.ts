// Which notification switches are WIRED to a reader.
//
// 🔴 TEN OF THE EIGHTEEN GRID SWITCHES WERE READ BY NOTHING (meta-scan B9 D1/D6 + B8 §5,
// 2026-09-04 — the SCAN-528 shape: written, displayed, enforced by nothing). Every switch persisted
// and rendered as saved, and the member had no way to tell which ones did anything:
//   • the five `inapp_*` switches other than `inapp_practice`: the 29 direct `notifications` inserts
//     across app/ + lib/ consult no preference, `shouldSend(…, 'inapp', …)` had zero call sites, and
//     the router (./router.ts) records the in-app channel as 'skipped' because no in-app outbox
//     handler exists yet;
//   • `mentions` and `comments` on every channel: no mention or reply email/push emitter exists
//     anywhere, and the three `type: 'mention'` in-app inserts check nothing — so the two rows read
//     as a live subscription (default ON) to mail that can never arrive;
//   • `email_practice`: the reminder cron reads `inapp_practice` and `push_practice` only.
//
// This map is the ONE declaration of which (category, channel) pairs a send site actually reads,
// and both preference surfaces (/settings#notifications and /manage-emails) render a switch ONLY
// for a wired pair; an unwired cell renders as a dash, and a topic with no wired cell earns no row.
// The stored columns stay: hiding a switch never discards a choice, and an emitter that ships later
// flips its pair here and the switch reappears in the same commit (the same shape as
// DIGEST_BATCHER_EXISTS in lib/notification-preferences.ts).
//
// It is held true by ./wired.test.ts, which walks app/ + lib/ + components/ for the real readers
// (gate calls, push sends, direct column reads, registry rows) and fails BOTH ways: a wired pair
// with no reader is a lying switch, a reader for a pair marked unwired is a hidden switch that
// should be back.
//
// A separate module, not lib/notification-preferences.ts, on purpose: the settings form is a client
// component, and the preferences module imports the admin Supabase client. Type imports only.

import type { NotificationCategory, NotificationChannel } from '@/lib/notification-preferences'

export const WIRED_PREFERENCE_CHANNELS: Record<NotificationCategory, readonly NotificationChannel[]> = {
  dispatches: ['email', 'push'],
  events:     ['email', 'push'],
  // ⏳ No mention emitter on any channel. Re-enable per channel when one ships (router checklist).
  mentions:   [],
  lifecycle:  ['email', 'push'],
  // ⏳ No reply emitter on any channel. Same.
  comments:   [],
  // In-app + push are read by lib/practices/lifecycle.ts; email is not read anywhere.
  practice:   ['inapp', 'push'],
}

/** True when a send site reads `<channel>_<category>` today, so a switch for it is honest. */
export function isPreferenceWired(channel: NotificationChannel, category: NotificationCategory): boolean {
  return WIRED_PREFERENCE_CHANNELS[category].includes(channel)
}

/** The categories that have at least one wired switch, i.e. the rows a preference grid shows. */
export function wiredCategories(categories: readonly NotificationCategory[]): NotificationCategory[] {
  return categories.filter((category) => WIRED_PREFERENCE_CHANNELS[category].length > 0)
}
