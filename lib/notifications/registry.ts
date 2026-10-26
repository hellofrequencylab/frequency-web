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
export type NotificationEvent =
  | 'event.dispatch'
  | 'booking.reminder'
  | 'guestbook.sign'
  | 'post.mention'
  | 'post.reply'
  | 'event.notice'
  | 'practice.term_complete'
  | 'practice.reminder'
  | 'practice.stale_check'
  | 'housing.match'
  | 'plan.share'
  | 'plan.comment'
  | 'plan.assign'
  | 'order.shipped'
  | 'loyalty.nudge'

/** The typed payload each event's `render` receives. Keyed by event, so a registry row
 *  and its call sites share one shape and a typo is a compile error, not a runtime one. */
export interface NotificationContexts {
  /** A host Event Dispatch fanning out to the event audience (push today; ADR-255). The
   *  caller (composeEventDispatch) already authored the title/body in-voice. */
  'event.dispatch': { title: string; body: string; url: string; eventId?: string | null }
  /** The 24h-before booking reminder (ADR-605). The caller renders the full email from the
   *  existing transactional template and hands it in, so the router only transports it. */
  'booking.reminder': { email: EmailPayload }
  /** Someone signed the recipient's Spotlight Guestbook (ADR-1279). The caller
   *  (lib/spotlight/guestbook.ts notifyGuestbookSigned) authors the copy in-voice and the URL of
   *  the owner's own guestbook. */
  'guestbook.sign': { title: string; body: string; url: string; ownerHandle: string; signerProfileId: string }
  /** Someone @mentioned the recipient in a post or reply (`mentions`, in-app). The caller
   *  (app/(main)/feed/actions.ts fanOutMentions) hands in the author, the post and where it was
   *  said ('a post' / 'a reply'); the recipient's own inapp_mentions switch decides. */
  'post.mention': { authorId: string; postId: string; context: string }
  /** Someone replied to the recipient's post (`comments`, in-app). The caller
   *  (app/(main)/feed/actions.ts notifyParentAuthor) hands in the replier and the post. */
  'post.reply': { replierId: string; postId: string }
  /** A person-to-person event notice: a share asked or answered, a placement asked or decided,
   *  a host transfer, a co-host invite (`events`, in-app). The caller
   *  (lib/notifications/event-notice.ts) hands in the bell row's type and predicate; the
   *  recipient's own inapp_events switch decides. */
  'event.notice': { type: string; actorId: string | null; eventId: string; body: string }
  /** A practice term finished, a daily "still waiting" nudge, and the once-ever "still keeping
   *  this?" prompt (`practice`; lib/practices/lifecycle.ts). The caller authors the sentence
   *  in-voice and hands the practice; the recipient's own inapp_practice / push_practice
   *  switches decide. `tag` collapses a repeat push on the device. */
  'practice.term_complete': { practiceId: string; body: string; tag: string }
  'practice.reminder': { practiceId: string; body: string; tag: string }
  'practice.stale_check': { practiceId: string; body: string }
  /** A new housing match that lines up with the recipient (DEF-HOUS, ADR-1278). The caller
   *  (lib/listings/housing-match-alerts.ts) authors the push copy in-voice and renders the email
   *  from lib/email's builder; `tag` collapses a repeat push for the same counterpart on the
   *  device, on top of the once-per-pair claim the caller already made. */
  'housing.match': { title: string; body: string; url: string; tag: string; email?: EmailPayload }
  /** A Plan share offered, accepted or declined between two Spaces (PROG-CAL7, LIVE-545). The
   *  caller (lib/calendar/plan-notify.ts) authors the copy in-voice, hands the URL of the
   *  recipient's own calendar settings, and renders the email from lib/email's builder when the
   *  recipient has an address. `lifecycle`: a Space's working relationships changing hands. */
  'plan.share': { title: string; body: string; url: string; tag: string; email?: EmailPayload }
  /** A comment on a shared Plan or one of its to-dos (LIVE-545). `comments`, push: the
   *  recipient's own push_comments switch decides; `tag` collapses a burst on one thread. */
  'plan.comment': { title: string; body: string; url: string; tag: string }
  /** A to-do on a shared Plan handed to the recipient (LIVE-545). `comments`, push. */
  'plan.assign': { title: string; body: string; url: string; tag: string }
  /** The seller marked a buyer's order shipped (LIVE-606, ADR-1575). The caller
   *  (lib/commerce/fulfilment.ts notifyOrderShipped) authors the push copy in-voice and renders
   *  the email from the money-receipt builders; a buyer with no deliverable address hands in no
   *  email and that channel is a clean skip. */
  'order.shipped': { title: string; body: string; url: string; email?: EmailPayload }
  /** A Regulars card one stamp from its reward (LIVE-943, ADR-1782). The caller
   *  (lib/loyalty/visit.ts nudgeOneAway) authors the copy in-voice; `tag` collapses a repeat for
   *  the same Space on the device, and the subject lets a per-Space mute win. */
  'loyalty.nudge': { title: string; body: string; url: string; tag: string }
}

/** One bell row, in the shape of a `notifications` row (the table the bell and /notifications
 *  read). The bell prints the actor's name before `body` and picks its destination from
 *  `type` + `referenceType` + `referenceId` (lib/notifications/href.ts), so a type that rides
 *  the in-app channel hands in exactly that tuple; there is no free-form URL on the row. */
export interface InappPayload {
  /** The row's `type`, e.g. 'guestbook_signed'. */
  type: string
  /** The sentence after the actor's name, e.g. 'signed your guestbook'. */
  body: string
  actorId?: string | null
  referenceType?: string | null
  referenceId?: string | null
}

/** Per-channel rendered payloads. A type renders only the channels it declares; a channel
 *  with no rendered payload is skipped (never enqueued half-formed). `inapp` rides the
 *  outbox as the 'inapp' job (lib/notifications/inapp.ts), gated by the member's own
 *  `inapp_<category>` switch like email and push. */
interface RenderedNotification {
  email?: EmailPayload
  push?: PushPayload
  inapp?: InappPayload
}

/** One registry row: the declarative mapping event → notification type. */
interface NotificationType<E extends NotificationEvent = NotificationEvent> {
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
  // A Guestbook note (ADR-1279). A note is the closest thing to a reply someone leaves on your
  // own page, so it rides the `comments` category: the owner's push_comments switch decides
  // the push, and the bell row rides the in-app channel behind inapp_comments. The bell prints
  // the signer's name before the body and lands on the owner's guestbook.
  'guestbook.sign': {
    event: 'guestbook.sign',
    category: 'comments',
    channels: ['inapp', 'push'],
    render: (ctx) => ({
      inapp: {
        type: 'guestbook_signed',
        body: 'signed your guestbook',
        actorId: ctx.signerProfileId,
        referenceType: 'guestbook',
        referenceId: ctx.ownerHandle,
      },
      push: { title: ctx.title, body: ctx.body, url: ctx.url },
    }),
  },

  // An @mention in a post or reply. Its own `mentions` category, in-app only: the recipient's
  // inapp_mentions switch (default on) decides, so the Mentions row in settings is a real switch.
  'post.mention': {
    event: 'post.mention',
    category: 'mentions',
    channels: ['inapp'],
    render: (ctx) => ({
      inapp: {
        type: 'mention',
        body: `mentioned you in ${ctx.context}`,
        actorId: ctx.authorId,
        referenceType: 'post',
        referenceId: ctx.postId,
      },
    }),
  },
  // A person-to-person event notice. `events`, in-app: the recipient's inapp_events switch
  // decides, so the Events row in settings is a real switch for these.
  'event.notice': {
    event: 'event.notice',
    category: 'events',
    channels: ['inapp'],
    render: (ctx) => ({
      inapp: { type: ctx.type, body: ctx.body, actorId: ctx.actorId, referenceType: 'event', referenceId: ctx.eventId },
    }),
  },
  // A reply to your post. `comments`, in-app: inapp_comments decides, as it did when the feed
  // action read the gate by hand.
  'post.reply': {
    event: 'post.reply',
    category: 'comments',
    channels: ['inapp'],
    render: (ctx) => ({
      inapp: {
        type: 'reply',
        body: 'replied to your post',
        actorId: ctx.replierId,
        referenceType: 'post',
        referenceId: ctx.postId,
      },
    }),
  },

  // The practice lifecycle (lib/practices/lifecycle.ts). All `practice`: the completion and the
  // daily reminder go in-app and push, the staleness prompt is a quiet in-app note only.
  'practice.term_complete': {
    event: 'practice.term_complete',
    category: 'practice',
    channels: ['inapp', 'push'],
    render: (ctx) => ({
      inapp: { type: 'practice_term_complete', body: ctx.body, referenceType: 'practice', referenceId: ctx.practiceId },
      push: { title: 'Practice complete', body: ctx.body, url: `/practices/${ctx.practiceId}`, tag: ctx.tag },
    }),
  },
  'practice.reminder': {
    event: 'practice.reminder',
    category: 'practice',
    channels: ['inapp', 'push'],
    render: (ctx) => ({
      inapp: { type: 'practice_reminder', body: ctx.body, referenceType: 'practice', referenceId: ctx.practiceId },
      push: { title: 'Time to practice', body: ctx.body, url: '/on-air', tag: ctx.tag },
    }),
  },
  'practice.stale_check': {
    event: 'practice.stale_check',
    category: 'practice',
    channels: ['inapp'],
    render: (ctx) => ({
      inapp: { type: 'practice_stale_check', body: ctx.body, referenceType: 'practice', referenceId: ctx.practiceId },
    }),
  },

  // A new housing match (ADR-1278). Community category `matches`: the member's own
  // email_matches / push_matches switches gate it, one-click unsubscribe carries the category,
  // and the caller claims the (recipient, counterpart, kind) pair before routing so a member is
  // told about a person once. Email is rendered by the caller; a caller with no deliverable
  // address hands in no email and the channel is a clean skip.
  'housing.match': {
    event: 'housing.match',
    category: 'matches',
    channels: ['email', 'push'],
    render: (ctx) => ({
      push: { title: ctx.title, body: ctx.body, url: ctx.url, tag: ctx.tag },
      ...(ctx.email ? { email: ctx.email } : {}),
    }),
  },

  // THE THREE MOMENTS ON A SHARED PLAN (PROG-CAL7 Together, LIVE-545). One send per moment,
  // to the other team, never to the person who did the thing; the caller resolves WHO
  // (lib/calendar/plan-notify.ts) and the registry owns WHAT and the gate mapping. No new
  // category and no new column: a share rides `lifecycle` (a Space's working relationships
  // changing), a comment and a hand-over ride `comments`, the closest thing to a reply on
  // your own work, so the switches the grid already wires decide every channel.
  'plan.share': {
    event: 'plan.share',
    category: 'lifecycle',
    channels: ['email', 'push'],
    render: (ctx) => ({
      push: { title: ctx.title, body: ctx.body, url: ctx.url, tag: ctx.tag },
      ...(ctx.email ? { email: ctx.email } : {}),
    }),
  },
  'plan.comment': {
    event: 'plan.comment',
    category: 'comments',
    channels: ['push'],
    render: (ctx) => ({
      push: { title: ctx.title, body: ctx.body, url: ctx.url, tag: ctx.tag },
    }),
  },
  'plan.assign': {
    event: 'plan.assign',
    category: 'comments',
    channels: ['push'],
    render: (ctx) => ({
      push: { title: ctx.title, body: ctx.body, url: ctx.url, tag: ctx.tag },
    }),
  },

  // A shipped order (LIVE-606, ADR-1575). Lifecycle category: the buyer's own email_lifecycle /
  // push_lifecycle switches gate it, so a member who turned lifecycle mail off finds out from
  // My orders instead of their inbox, and suppression still wins on the address. Not
  // transactional on purpose: the receipt was the record of the charge; this is news about it.
  'order.shipped': {
    event: 'order.shipped',
    category: 'lifecycle',
    channels: ['email', 'push'],
    render: (ctx) => ({
      push: { title: ctx.title, body: ctx.body, url: ctx.url },
      ...(ctx.email ? { email: ctx.email } : {}),
    }),
  },

  // One stamp away on a Regulars card (LIVE-943). Lifecycle category, push only: news about the
  // member's own standing at a Space, so their push_lifecycle switch and a per-Space mute decide.
  // Sent once per card by construction (the card passes required-1 once).
  'loyalty.nudge': {
    event: 'loyalty.nudge',
    category: 'lifecycle',
    channels: ['push'],
    render: (ctx) => ({
      push: { title: ctx.title, body: ctx.body, url: ctx.url, tag: ctx.tag },
    }),
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
