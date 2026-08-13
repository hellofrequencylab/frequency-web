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
// `reference_type: 'space'` is written with BOTH: the Space Community fan-out stores the
// slug (lib/spaces/content-actions), the billing renewal cron stores the id
// (app/api/cron/billing-renewals). Routing a UUID through `/spaces/<id>/community` is a
// guaranteed 404, so the shape is checked rather than assumed.

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
 * Pure: no IO, no auth read. A destination whose page gates the viewer (the CRM consoles)
 * is still correct to emit — `requireAdmin` redirects a viewer who may not be there to
 * `/feed`, which is exactly where they used to land anyway.
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

    // Slug → the Space Community tab the fan-out is about. Id → the billing renewal notice,
    // whose audience is the Space's owner and admins, so the Spaces-you-run hub.
    case 'space':
      if (!id) return '/spaces/directory'
      return UUID_RE.test(id) ? '/spaces/operating' : `/spaces/${id}/community`

    // A Household bundle seat offer (ADR-370). The invite id is a UUID and there is no page
    // keyed on it: the seat is answered in the Plan and billing section of Settings, which is
    // also where the person would go looking for anything about their membership.
    case 'bundle_invite':
      return '/settings#plan'

    case 'dispatch':
      return id ? `/nearby/${id}` : '/nearby'

    case 'support_ticket':
      return id ? `/support/${id}` : '/support'

    case 'practice':
      return id ? `/practices/${id}` : '/practices'

    // An inbound reply on the comms spine: the Conversation workspace opens the thread by id.
    case 'conversation':
      return id ? `/admin/crm/conversations?id=${encodeURIComponent(id)}` : '/admin/crm/conversations'

    // A CRM contact has no detail route; the roster is the surface that holds it.
    case 'contact':
      return '/admin/crm/contacts'

    // Circle notices (a Circle milestone, a Circle membership's first-week notes) reference a
    // UUID while /circles/<slug> is slug-addressed, so they land on the Circles index.
    case 'circle':
    case 'membership':
      return '/circles'

    // Events and Journeys are slug-addressed too, and the notice carries the id.
    case 'event':
      return '/events'
    case 'journey':
      return '/journeys'

    default:
      return NOTIFICATION_FALLBACK_HREF
  }
}
