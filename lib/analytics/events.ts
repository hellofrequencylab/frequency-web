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
  // Splash-funnel instrumentation (ADR-617 Phase 1). Anonymous + fire-safe: keyed by the funnel
  // slug (props.seq) + style (props.style), so the /pages/sequences stats can show entered → captured
  // → signed-up per funnel. `entered` fires once on funnel load; `captured` when a feature funnel
  // collects an email mid-flow (the "get yours free" moment). Signup is attributed server-side via
  // the member's beta_<slug> tag, so no client signup event is needed.
  { name: 'onboarding.funnel_entered', category: 'lifecycle', description: 'A visitor loaded a splash funnel (props.seq, props.style).', clientEmittable: true },
  { name: 'onboarding.funnel_captured', category: 'lifecycle', description: 'A feature funnel captured a lead email mid-flow (props.seq, props.style).', clientEmittable: true },

  // ── Server-authoritative lifecycle + engagement (recorded server-side only) ──
  { name: 'account.created', category: 'lifecycle', description: 'New auth user / profile row (props.source).', clientEmittable: false },
  { name: 'onboarding.induction_completed', category: 'lifecycle', description: 'Finished the beta induction (props.hasAvatar, props.hasIntent).', clientEmittable: false },
  { name: 'onboarding.vera_opened', category: 'lifecycle', description: 'Reached the Vera onboarding concierge.', clientEmittable: false },
  { name: 'profile.completed', category: 'lifecycle', description: 'Name / handle / avatar set.', clientEmittable: false },
  { name: 'circle.joined', category: 'engagement', description: 'Membership became active (props.circleId).', clientEmittable: false },
  { name: 'event.rsvp', category: 'engagement', description: 'RSVP created (props.eventId).', clientEmittable: false },
  { name: 'practice.adopted', category: 'engagement', description: 'A practice was adopted (props.practiceId).', clientEmittable: false },

  // ── QR platform (server-authoritative; the /q resolver + actions) ────────────
  { name: 'qr.scanned', category: 'engagement', description: 'A dynamic code was scanned (props.purpose, props.destination).', clientEmittable: false },
  { name: 'qr.referral_signup', category: 'lifecycle', description: 'A new member attributed to a referral code (props.referrer).', clientEmittable: false },
  { name: 'qr.gift_zap', category: 'engagement', description: 'A member sent a zap via a gift code (props.to).', clientEmittable: false },
  { name: 'qr.code_designed', category: 'feature', description: 'A member saved a code design (props.kind).', clientEmittable: true },
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
