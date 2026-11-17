// Canonical analytics event taxonomy (ADR-070, ANALYTICS.md). Every tracked product
// event is named here so coverage is reviewable and the dual-emit `track()` helper
// (first-party + GA4) can't drift. One module, governed like the trait registry.
//
// `clientEmittable` gates the /api/track endpoint: navigation + UI-interaction events
// are safe to send from the browser; server-authoritative events (joins, RSVPs,
// verified practice) are recorded server-side only and can NEVER be spoofed by a
// client POST.

type AnalyticsCategory = 'navigation' | 'feature' | 'lifecycle' | 'engagement'

interface AnalyticsEventDef {
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
  { name: 'onboarding.funnel_entered', category: 'lifecycle', description: 'A visitor loaded a Funnel splash (props.seq, props.style).', clientEmittable: true },
  { name: 'onboarding.funnel_captured', category: 'lifecycle', description: 'A feature funnel captured a lead email mid-flow (props.seq, props.style).', clientEmittable: true },

  // The /how advisor brief (lib/how/brief-events.ts). Anonymous by design: recorded ONLY by
  // /api/how/beacon (consent-gated, rate-limited, cookie-free sid), never by /api/track, so
  // clientEmittable stays false and a member POST can't spoof them.
  { name: 'how.view', category: 'engagement', description: 'The /how brief was opened (props.ref, utm_*, device).', clientEmittable: false },
  { name: 'how.section_view', category: 'engagement', description: 'A /how section came into view (props.section).', clientEmittable: false },
  { name: 'how.section_dwell', category: 'engagement', description: 'Time a /how section was on screen (props.section, props.ms).', clientEmittable: false },
  { name: 'how.scroll_depth', category: 'engagement', description: 'A /how scroll-depth milestone (props.pct).', clientEmittable: false },
  { name: 'how.heartbeat', category: 'engagement', description: 'Engaged time on /how, every 15s (props.engaged_s).', clientEmittable: false },
  { name: 'how.calc_input', category: 'engagement', description: 'A /how calculator slider settled (props.calc, key, value).', clientEmittable: false },
  { name: 'how.appendix_open', category: 'engagement', description: 'A /how appendix item opened (props.item).', clientEmittable: false },
  { name: 'how.link_click', category: 'engagement', description: 'A link, button or form on a private partner page was used (props.page, kind, target, label).', clientEmittable: false },
  { name: 'how.copy', category: 'engagement', description: 'Text was copied from /how (props.section, chars).', clientEmittable: false },
  { name: 'how.complete', category: 'engagement', description: 'The /how reader reached the closing section.', clientEmittable: false },
  { name: 'how.exit', category: 'engagement', description: 'The /how page was hidden or left (props.engaged_s, max_pct).', clientEmittable: false },

  // ── Server-authoritative lifecycle + engagement (recorded server-side only) ──
  { name: 'account.created', category: 'lifecycle', description: 'New auth user / profile row (props.source).', clientEmittable: false },
  { name: 'lead.captured', category: 'lifecycle', description: 'A server-confirmed durable lead was saved (props.source).', clientEmittable: false },
  { name: 'onboarding.induction_completed', category: 'lifecycle', description: 'Finished the beta induction (props.hasAvatar, props.hasIntent).', clientEmittable: false },
  { name: 'onboarding.vera_opened', category: 'lifecycle', description: 'Reached the Vera onboarding concierge.', clientEmittable: false },
  { name: 'profile.completed', category: 'lifecycle', description: 'Name / handle / avatar set.', clientEmittable: false },
  { name: 'circle.joined', category: 'engagement', description: 'Membership became active (props.circleId).', clientEmittable: false },
  { name: 'event.rsvp', category: 'engagement', description: 'RSVP created (props.eventId).', clientEmittable: false },
  { name: 'practice.adopted', category: 'engagement', description: 'A practice was adopted (props.practiceId).', clientEmittable: false },

  // ── QR platform (server-authoritative; the /q resolver + actions) ────────────
  { name: 'qr.scanned', category: 'engagement', description: 'A dynamic code was scanned (props.purpose, props.destination).', clientEmittable: false },
  { name: 'qr.referral_signup', category: 'lifecycle', description: 'A new member attributed to a referral code (props.referrer).', clientEmittable: false },
  // 2026-09-05 (scan2 L4-03): lib/qr/referral.ts has emitted this since the referral reward shipped,
  // and track() dropped it as unregistered, so the activation moment never reached the GA4 mirror.
  { name: 'qr.referral_activated', category: 'lifecycle', description: 'A referred member activated and the referrer was credited (props.referrer).', clientEmittable: false },
  { name: 'qr.gift_zap', category: 'engagement', description: 'A member sent a zap via a gift code (props.to).', clientEmittable: false },
  { name: 'qr.code_designed', category: 'feature', description: 'A member saved a code design (props.kind).', clientEmittable: true },

  // ── Commerce (LIVE-348). Purchase is server-only: checkout settles on Stripe or an
  // Elements form whose success never navigates, so a client-side purchase event cannot fire.
  // checkout_started is the buy click, the one step that must be client-side.
  { name: 'commerce.checkout_started', category: 'engagement', description: 'A buyer pressed Buy or Get ticket (props.kind).', clientEmittable: true },
  { name: 'commerce.purchase', category: 'engagement', description: 'A Checkout Session settled paid (props.kind, props.value, props.currency, props.transaction_id).', clientEmittable: false },
  { name: 'shop.order_completed', category: 'engagement', description: 'A commerce_order Checkout Session settled paid. Writer for the shop vertical reader.', clientEmittable: false },
  // ── Pricing (LIVE-758). The upgrade moment on a price surface: shown, trial started, or kept free.
  // Generic by design: props.surface (event, membership, booking, journey, product), props.action and
  // props.scope (space or personal) only, never what the event or practice is.
  { name: 'pricing.upgrade_moment', category: 'feature', description: 'A host met the upgrade moment on a price surface (props.surface, props.action, props.scope).', clientEmittable: true },
  // ── Create a Space, signed out (LIVE-1970, ADR-1933). Anonymous: no actor, one row per tab and event, posted to
  // the builder's own sink (app/api/create-space/signal), which admits only these nine with closed props
  // (lib/create-space/signal.ts). Never typed text: a kit id, a step id, an accent index, flags, intent ids.
  { name: 'createspace.view', category: 'lifecycle', description: 'A visitor opened the Create a Space builder (props.kit, props.chosen).', clientEmittable: false },
  { name: 'createspace.name_started', category: 'lifecycle', description: 'A visitor typed the first letter of a name.', clientEmittable: false },
  { name: 'createspace.accent_picked', category: 'lifecycle', description: 'A visitor picked an accent (props.accent, an index).', clientEmittable: false },
  { name: 'createspace.step_done', category: 'lifecycle', description: 'A builder step was saved (props.step, props.seconds since the first letter).', clientEmittable: false },
  { name: 'createspace.offer', category: 'lifecycle', description: 'A visitor mocked up the site from a sentence (props.example_used, props.intents).', clientEmittable: false },
  { name: 'createspace.lead', category: 'lifecycle', description: 'A visitor saved the draft to an address (props.has_phone, props.has_where).', clientEmittable: false },
  { name: 'createspace.photos', category: 'lifecycle', description: 'A visitor finished the photos step (props.uploaded, props.kept_theme).', clientEmittable: false },
  { name: 'createspace.resume', category: 'lifecycle', description: 'A visitor picked a draft back up (props.source: local or email).', clientEmittable: false },
  { name: 'createspace.dock_click', category: 'lifecycle', description: 'A visitor used the sticky dock to get back to the builder.', clientEmittable: false },
  // ── Space activation past launch (LIVE-2335, lib/spaces/space-events.ts). Server-only and first-party only (all
  // three sit in FIRST_PARTY_ONLY_EVENTS, ./sanitize.ts). Ids and a count only: never a subject, a body or an audience.
  { name: 'space.spotlight_published', category: 'lifecycle', description: 'A Space published its Spotlight from the console (props.spaceId).', clientEmittable: false },
  { name: 'space.website_published', category: 'lifecycle', description: 'A Space switched its website on (props.spaceId).', clientEmittable: false },
  { name: 'space.campaign_sent', category: 'engagement', description: 'A Space campaign or email went out (props.spaceId, props.recipientCount).', clientEmittable: false },
  // ── Frequency Hunts (FH-025). Server-only, and the only props are the closed dimensions lib/hunts/analytics.ts
  // allows (reason_class, medium, cohort, assurance, hunt_id, replayed): never a location, a code or a contact.
  { name: 'hunt.placement_scan', category: 'engagement', description: 'A printed or tapped Hunt placement was opened (props.medium).', clientEmittable: false },
  { name: 'hunt.stop_claim', category: 'engagement', description: 'A player asked to confirm a stop (props.reason_class, props.assurance).', clientEmittable: false },
  { name: 'hunt.staff_verify', category: 'engagement', description: 'A venue checked a player proof at the door (props.reason_class).', clientEmittable: false },
  { name: 'hunt.reward_redeem', category: 'engagement', description: 'A venue handed over a Hunt reward (props.reason_class).', clientEmittable: false },
  { name: 'hunt.reward_void', category: 'engagement', description: 'A venue cancelled a Hunt reward (props.reason_class).', clientEmittable: false },
  // ── Editor (PROG-E8B, EDITOR-ARCHITECTURE 8.1 item 8). Vera asks a block's owner reviewed questions and never
  // writes a word (ADR-1939 section 4). These two say what the owner did with one question: went to the field to
  // answer it, or put it away. Ids, the block type, a position and a count only: never the question's wording,
  // never what is in a field, nothing about a person. First-party only: both names sit in FIRST_PARTY_ONLY_EVENTS
  // (./sanitize.ts), so neither mirror sends them to a pixel.
  { name: 'editor.vera_question_accepted', category: 'feature', description: 'An owner went to answer one of the questions Vera asked on a block (props.blockType, props.field, props.questionId, props.source, props.position, props.shown).', clientEmittable: true },
  { name: 'editor.vera_question_dismissed', category: 'feature', description: 'An owner dismissed one of the questions Vera asked on a block (same props).', clientEmittable: true },
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
