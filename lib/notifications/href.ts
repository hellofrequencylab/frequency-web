// WHERE A NOTIFICATION GOES WHEN YOU CLICK IT.
//
// One pure function over the `(type, reference_type, reference_id, actor)` tuple every
// `notifications` row carries, split out of the bell so it is testable without React.
//
// The rule: land on the thing the notice is ABOUT whenever the row carries enough to
// address it, and on the nearest surface that CONTAINS that thing when it does not.
// `/feed` is the last resort, not the default — it used to be both.
//
// Two shapes of reference_id exist in the wild and they are NOT interchangeable:
//   • an addressable KEY (a Space slug, a support ticket id, a practice id) — routable
//   • an opaque UUID for a slug-addressed entity (an event id, a circle id, a Journey
//     plan id) — NOT routable, because the matching page keys on the slug and this is a
//     client component with no way to resolve one. Those land on the index that lists it.
// `reference_type: 'space'` is written with BOTH: the Space fan-out stores the slug
// (lib/spaces/content-actions), the billing renewal cron stores the id
// (app/api/cron/billing-renewals). Routing a UUID through `/spaces/<id>` is a
// guaranteed 404 (the page keys on the slug), so the shape is checked rather than assumed.

import type { NotificationItem } from '@/lib/notifications-map'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The surface a notice falls back to when nothing more specific is addressable. */
export const NOTIFICATION_FALLBACK_HREF = '/feed'

function trimmed(value: string | null | undefined): string | null {
  const v = (value ?? '').trim()
  return v.length > 0 ? v : null
}

/**
 * The destination for one notification row. Always returns a real in-app path.
 *
 * Pure: no IO, no auth read. That means the destination is chosen from the row alone, so a
 * GATED destination is only correct when the row's WRITERS all address the gated audience.
 * Check the writer, not the page: `/admin/crm/conversations` is right for `conversation`
 * because that bell is aimed at the assigned support agent, and it was wrong for `contact`
 * because both writers of that row aim at a Space OWNER, who is an ordinary member and gets
 * bounced (LIVE-505). "They would have landed on /feed anyway" does not rescue such a link:
 * the bell is the only notice that carries a destination, and one that reliably bounces is a
 * notice the recipient cannot act on.
 */
export function notificationHref(n: NotificationItem): string {
  const id = trimmed(n.reference_id)
  const actorHandle = trimmed(n.actor?.handle)

  // Both halves of the friend handshake live on one screen, whatever they reference.
  if (n.type === 'friend_request' || n.type === 'friend_accepted') return '/network/friends'

  switch (n.reference_type) {
    // A post has no permalink of its own, so the feed carries a per-card anchor
    // (components/feed/post-card) and the notice deep-links to it.
    case 'post':
      return id ? `/feed#post-${id}` : NOTIFICATION_FALLBACK_HREF

    // A profile row references a person by id, and /people is handle-addressed. Every site
    // that writes this pair sets actor_id to that same profile, so the actor's handle is the
    // address; a row without one falls back to the member index.
    case 'profile':
      return actorHandle ? `/people/${actorHandle}` : '/people'

    // Slug → the Space root. The retiring Community tab is never emitted (ADR-1091 C3.2):
    // a Space's community is its Circles, which live on the Space's own page, and C3.3's
    // 308 covers any old link. Id → the billing renewal notice, whose audience is the
    // Space's owner and admins, so the Spaces-you-run hub.
    case 'space':
      if (!id) return '/spaces/directory'
      return UUID_RE.test(id) ? '/spaces/operating' : `/spaces/${id}`

    // A Household bundle seat offer (ADR-370). The invite id is a UUID and there is no page
    // keyed on it: the seat is answered in the Plan and billing section of Settings, which is
    // also where the person would go looking for anything about their membership.
    case 'bundle_invite':
      return '/settings#plan'

    // A Guestbook note (ADR-1279) references the OWNER's handle, an addressable key, so the notice
    // lands on the owner's own guestbook rather than on the signer.
    case 'guestbook':
      return id ? `/people/${id}#guestbook` : '/settings/profile'

    case 'dispatch':
      return id ? `/nearby/${id}` : '/nearby'

    case 'support_ticket':
      return id ? `/support/${id}` : '/support'

    case 'practice':
      return id ? `/practices/${id}` : '/practices'

    // A direct message (EMAIL-055): the 1:1 thread by conversation id. When the DM page is retired
    // the route itself forwards to the dock.
    case 'direct_message':
      return id ? `/messages/${id}` : '/messages'

    // An @ tag in a Plan or to-do comment (LIVE-2524). A Plan opens in the calendar console of the
    // team the person works it from, which is slug-addressed, and the row carries only the Plan id, so
    // "Spaces you run" resolves it on arrival (lib/calendar/plan-notify.ts planHrefForViewer).
    case 'plan':
      return id && UUID_RE.test(id) ? `/spaces/operating?plan=${id}` : '/spaces/operating'

    // An @ tag in a room message (LIVE-2525): the room, by id.
    case 'room':
      return id && UUID_RE.test(id) ? `/messages/r/${id}` : '/messages'

    // An inbound reply on the comms spine, by the thread's lane (EMAIL-074, lib/comms/reply-bell.ts).
    // A platform thread is staff work: the Conversation workspace opens it by id.
    case 'conversation':
      return id ? `/admin/crm/conversations?id=${encodeURIComponent(id)}` : '/admin/crm/conversations'

    // A leader's thread rings the leader, an ordinary member, so it opens their own inbox (the page
    // shows a thread only to its owner or assignee).
    case 'leader_conversation':
      return id ? `/lead/inbox?id=${encodeURIComponent(id)}` : '/lead/inbox'

    // A Space-lane thread rings that Space's owner or agent. Its inbox is addressed by Space SLUG and
    // the row carries only the thread UUID, so "Spaces you run" resolves the slug on arrival and sends
    // the owner on to /spaces/<slug>/crm/conversations?id=<thread>; a miss leaves them on the hub,
    // which still opens every Space console they run.
    case 'space_conversation':
      return id ? `/spaces/operating?conversation=${encodeURIComponent(id)}` : '/spaces/operating'

    // A contact-form lead (`crm_contact_form`) and an inbound CRM reply (`crm_inbound_reply`).
    // BOTH writers set recipient_id to the SPACE OWNER (lib/crm/lead-notify, lib/crm/inbox), never
    // to staff, so the staff roster at /admin/crm/contacts bounced every recipient this row has
    // (LIVE-505). The lead-notify EMAIL about the very same event already links the owner to
    // /spaces/<slug>/crm, so the bell and the email were sending one person two ways.
    //
    // The owner's own CRM is the thing this is about, but it is addressed by SPACE SLUG and the row
    // carries only the contact UUID — no space column exists on `notifications` (see
    // NotificationRpcRow). So this takes the rule this file already states and the `space` UUID arm
    // already follows: the nearest surface that CONTAINS the thing. "Spaces you run" lists the
    // owner's Spaces and each card opens that Space's console, which is where the CRM lives.
    case 'contact':
      return '/spaces/operating'

    // Circle notices (a Circle milestone, a Circle membership's first-week notes) reference a
    // UUID while /circles/<slug> is slug-addressed, so they land on the Circles index.
    case 'circle':
    case 'membership':
      return '/circles'

    // A refund or other order notice (lib/commerce/checkout.ts) opens the buyer's order list
    // rather than the feed (LIVE-2361).
    case 'order':
      return '/orders'

    // Events and Journeys are slug-addressed too, and the notice carries the id.
    case 'event':
      return '/events'
    case 'journey':
      return '/journeys'

    default:
      return NOTIFICATION_FALLBACK_HREF
  }
}
