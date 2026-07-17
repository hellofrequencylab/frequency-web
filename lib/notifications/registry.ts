// The notification REGISTRY (ADR-627). ONE declarative catalog that maps a domain
// EVENT (what happened in the product — 'event.dispatch', 'booking.reminder', …) to a
// notification TYPE: its send category (which the send-gate reads for consent/prefs),
// its default channels, whether it is transactional, and how each channel renders.
//
// Before this, every send site re-derived those facts ad hoc — a category string here,
// a `category: 'dispatches'` literal there, a bespoke gate call somewhere else (ADR-169
// centralized the DECISION, but not the MAPPING). Scattered mappings can't be audited
// and drift apart. This is the single source of truth: adding a notification is one row
// here, and the router (lib/notifications/router.ts) does the rest.
//
// TYPES ONLY imports from lib/push + lib/email (PushPayload / EmailPayload) so the
// registry never pulls web-push (node-only) into a client bundle — the same discipline
// lib/automations.ts follows. Copy is authored by the caller (server-only templates) and
// handed in through the typed context, so no brand copy lives here (the naming + voice
// canons govern the callers; the registry is transport, not authorship).

import type { NotificationChannel, PreferenceSubject } from '@/lib/notification-preferences'
import type { SendCategory } from '@/lib/comms/send-gate'
import type { EmailPayload } from '@/lib/email'
import type { PushPayload } from '@/lib/push'

/** The domain events the registry can route. Adding a notification = add a key here +
 *  its context shape in `NotificationContexts` + a row in `NOTIFICATION_REGISTRY`. The
 *  compiler then forces the three to stay in lock-step. */
export type NotificationEvent = 'event.dispatch' | 'booking.reminder'

/** The typed payload each event's `render` receives. Keyed by event, so a registry row
 *  and its call sites share one shape and a typo is a compile error, not a runtime one. */
export interface NotificationContexts {
  /** A host Event Dispatch fanning out to the event audience (push today; ADR-255). The
   *  caller (composeEventDispatch) already authored the title/body in-voice. */
  'event.dispatch': { title: string; body: string; url: string; eventId?: string | null }
  /** The 24h-before booking reminder (ADR-605). The caller renders the full email from the
   *  existing transactional template and hands it in, so the router only transports it. */
  'booking.reminder': { email: EmailPayload }
}

/** Per-channel rendered payloads. A type renders only the channels it declares; a channel
 *  with no rendered payload is skipped (never enqueued half-formed). `inapp` is defined for
 *  when the in-app channel graduates onto the outbox (see the router's migration checklist);
 *  no migrated type declares it yet. */
export interface RenderedNotification {
  email?: EmailPayload
  push?: PushPayload
  inapp?: { title: string; body: string; url?: string }
}

/** One registry row: the declarative mapping event → notification type. */
export interface NotificationType<E extends NotificationEvent = NotificationEvent> {
  event: E
  /** The send category the gate reads (consent scope + preference toggle + frequency). */
  category: SendCategory
  /** Default channels, in send order. The router attempts each, gating per channel. */
  channels: NotificationChannel[]
  /** Author/security/relationship mail that bypasses consent + prefs (only suppression can
   *  stop it). Mirrors `category === 'transactional'`; kept explicit for readability. */
  transactional?: boolean
  /** Turn the typed context into per-channel payloads. Pure — no IO, so it is unit-testable
   *  and the router stays the only async seam. */
  render: (ctx: NotificationContexts[E]) => RenderedNotification
}

/** Who a notification is for. `profileId` is required to run the send-gate (consent + prefs
 *  are per-member); `email` feeds the email-channel suppression check; `subject` lets the
 *  gate honour a per-Space/Circle topic mute. */
export interface NotificationRecipient {
  profileId: string
  email?: string | null
  subject?: PreferenceSubject
}

/**
 * THE CATALOG. One row per notification type. The router reads nothing else. Typed as a
 * per-event map so every `NotificationEvent` MUST have exactly one row (a missing or extra
 * key is a compile error), and each row's `render` is typed to that event's context.
 */
export const NOTIFICATION_REGISTRY: { [E in NotificationEvent]: NotificationType<E> } = {
  // A host Event Dispatch that rode the Dispatch rail (ADR-255). Community category, push
  // channel; the per-member push preference + per-event mute are enforced by the gate. The
  // audience (WHO) is resolved by the caller; the registry owns WHAT + the gate mapping.
  'event.dispatch': {
    event: 'event.dispatch',
    category: 'dispatches',
    channels: ['push'],
    render: (ctx) => ({
      push: { title: ctx.title, body: ctx.body, url: ctx.url },
    }),
  },
  // The 24h booking reminder (ADR-605). Transactional/relationship mail: past suppression it
  // always sends, so the gate only weighs the hard suppression list. The caller renders the
  // email from the existing template and hands it in; the router transports it durably.
  'booking.reminder': {
    event: 'booking.reminder',
    category: 'transactional',
    channels: ['email'],
    transactional: true,
    render: (ctx) => ({ email: ctx.email }),
  },
}

/** Pure registry lookup. Returns the notification type for an event, or throws on an unknown
 *  event (a programming error — every routed event must be catalogued). Kept as a named export
 *  so the routing decision can be reasoned about + unit-tested without any IO. */
export function resolveNotificationType<E extends NotificationEvent>(event: E): NotificationType<E> {
  const type = NOTIFICATION_REGISTRY[event]
  if (!type) throw new Error(`[notifications] no registry entry for event '${event}'`)
  return type
}
