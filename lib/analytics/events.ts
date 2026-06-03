// Canonical analytics event taxonomy (ADR-070, ANALYTICS.md). Every tracked product
// event is named here so coverage is reviewable and the dual-emit `track()` helper
// (first-party + GA4) can't drift. One module, governed like the trait registry.
//
// `clientEmittable` gates the /api/track endpoint: navigation + UI-interaction events
// are safe to send from the browser; server-authoritative events (joins, RSVPs,
// verified practice) are recorded server-side only and can NEVER be spoofed by a
// client POST.

export type AnalyticsCategory = 'navigation' | 'feature' | 'lifecycle' | 'engagement'

export interface AnalyticsEventDef {
  name: string
  category: AnalyticsCategory
  description: string
  clientEmittable: boolean
}

export const ANALYTICS_EVENTS: readonly AnalyticsEventDef[] = [
  // ── Navigation + UI interaction (client-emittable) ──────────────────────────
  { name: 'nav.page_view', category: 'navigation', description: 'A member viewed a route (props.path).', clientEmittable: true },
  { name: 'feature.used', category: 'feature', description: 'A member used a tracked feature (props.feature).', clientEmittable: true },
  { name: 'search.performed', category: 'engagement', description: 'A member ran a search (props.scope).', clientEmittable: true },

  // ── Server-authoritative lifecycle + engagement (recorded server-side only) ──
  { name: 'account.created', category: 'lifecycle', description: 'New auth user / profile row (props.source).', clientEmittable: false },
  { name: 'profile.completed', category: 'lifecycle', description: 'Name / handle / avatar set.', clientEmittable: false },
  { name: 'circle.joined', category: 'engagement', description: 'Membership became active (props.circleId).', clientEmittable: false },
  { name: 'event.rsvp', category: 'engagement', description: 'RSVP created (props.eventId).', clientEmittable: false },
  { name: 'practice.adopted', category: 'engagement', description: 'A practice was adopted (props.practiceId).', clientEmittable: false },
] as const

const BY_NAME = new Map(ANALYTICS_EVENTS.map((e) => [e.name, e]))

/** A registered analytics event name. */
export function isTrackedEvent(name: string): boolean {
  return BY_NAME.has(name)
}

/** Registered AND safe to emit from the browser (blocks client spoofing of
 *  server-authoritative events). */
export function isClientEvent(name: string): boolean {
  return BY_NAME.get(name)?.clientEmittable === true
}
