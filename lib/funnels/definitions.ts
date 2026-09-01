// Funnels — the sign-up funnels that are the product's front door (ADR-068 →
// ADR-1090, docs/FUNNELS.md). A Funnel is a splash + the induction's voiced copy,
// tuned to WHO is arriving, plus a marketing tag stamped on the member so cohorts
// are segmentable forever. The induction template accepts a `copy` override; a
// Funnel just feeds it. Owner directive (ADR-1090): "These are supposed to be
// focused funnels for building out any niche and getting a sign up."
//
// This module was lib/onboarding/beta-sequences.ts ("beta sequences") until the
// 2026-08-19 rename. Stored identifiers deliberately KEEP their beta_ names —
// the `beta-default` reserved slug, the `beta_*` marketing tags, `meta.beta.*`,
// the `fq_beta_seq` cookie — because they are data already written to members
// and browsers (same convention as beta_audit_log). Code identity is Funnels.
//
// The three hardcoded launch templates (early-adopter / personal / founding-partner)
// are retired: Funnels are now authored in the DB (the `sequence_overrides` table —
// stored name kept) through the /pages/sequences builder. What remains in code is
// the BASE flow — Vera's scripted copy from funnel-script — published under the
// reserved slug `beta-default`. /join with no ?seq runs it, and the owner edits
// its copy at /pages/splash (saved as the `beta-default` override).
//
// Client-safe (no server imports). The DB layer + merging live in
// lib/funnels/overrides.ts and lib/funnels/resolve.ts.

import { VERA, HEARD_ABOUT, type VeraCopy } from '@/lib/onboarding/funnel-script'
import type { FunnelStyleId } from '@/lib/funnels/styles'

/** A FEATURE funnel's playable-demo config (ADR-619). A feature funnel lets a visitor use ONE
 *  stripped feature before signing up; the renderer is keyed by `feature`. Today only `breathwork`
 *  ships (the box-breath visualizer); the shape is forward-built for the timer / QR / CRM demos. */
export interface FeatureFunnelConfig {
  /** Which feature the demo plays. The renderer switches on this. */
  feature: 'breathwork'
  /** Breath pattern slug for the breathwork demo (see BREATH_PATTERNS). Defaults to 'box'. */
  pattern?: string
  /** The Zap count shown landing in the reward beat (a truthful stat, kept in data so it tracks
   *  the live award without a client import of the server-only zap engine). Defaults to 12. */
  zapsReward?: number
}

export interface FunnelSplash {
  /** Small kicker above the headline. */
  eyebrow: string
  headline: string
  body: string
  /** Primary CTA into the induction. */
  cta: string
  /** Full-bleed hero image behind the splash (public/ path). */
  image: string
  imageAlt: string
  /** A short interstitial line under the hero — wrap the accent word in *asterisks*. */
  statement: string
}

/** One "what are you into" feature card (Slide 2 of a NICHE funnel). A niche funnel replaces the
 *  generic persona fork with 4 of these, tuned to the niche. Icon is a NAME resolved to a lucide
 *  icon in the induction (lib/funnels/icons), so this stays client-safe + serialisable. */
export interface FunnelFeature {
  title: string
  blurb: string
  /** Lucide icon name (see FUNNEL_ICONS). Unknown / absent falls back to a neutral default. */
  icon: string
}

/** One core-feature the visitor can pick on Slide 3 of a NICHE funnel, with its ART. The art reuses
 *  the induction's existing product renders (feed / circles / events) or an image, so most niches
 *  need no new drawing (owner directive: reuse art, only draw the few that are missing). */
export interface FunnelCoreFeature {
  title: string
  blurb: string
  art:
    | { kind: 'render'; render: 'feed' | 'circles' | 'events' | 'booking' | 'checkin' | 'donate' | 'tickets' | 'crm' }
    | { kind: 'image'; src: string }
}

/** Where finishing a funnel sends the new member. The GENERAL funnel goes to the Beta waitlist; each
 *  NICHE funnel admits directly to a niche-relevant section (an editable in-app link). */
export type FunnelDestination =
  | { mode: 'waitlist' }
  | { mode: 'direct'; url: string }

// Collision guard (docs/NAMING.md §Funnels): this `Funnel` is the member-facing
// sign-up feature. The Growth OS analytics rollup in lib/funnels/store.ts exports
// an unrelated `Funnel` (a `funnels` DB row with measurement stages) for the
// /admin/growth/funnels console — server-only, operator-facing, never rendered to
// a visitor. No module imports both.
export interface Funnel {
  slug: string
  /** Which funnel STYLE renders this sequence (ADR-617). Absent = `'onboarding'` (the induction),
   *  so every legacy funnel reads back as an Onboarding funnel with no backfill. `'feature'` routes
   *  to the playable feature funnel (needs `feature`); `'demographic'` is planned. */
  style?: FunnelStyleId
  /** FEATURE-style config: the playable demo + its settings. Present only when `style === 'feature'`. */
  feature?: FeatureFunnelConfig
  /** Human label for the audience (admin + analytics). */
  audience: string
  /** Tag stamped on members who arrive via this sequence — segment them forever. */
  marketingTag: string
  /** The public splash page copy. */
  splash: FunnelSplash
  /** The induction's voiced copy (Vera's HOT register). */
  vera: VeraCopy
  heardAbout: string[]
  /** NICHE funnels: the 4 "what are you into" feature cards shown on Slide 2 in place of the generic
   *  persona fork. Absent / empty = keep the persona fork (the General funnel's behaviour). */
  slide2Features?: FunnelFeature[]
  /** NICHE funnels: the 3 core features + art shown on Slide 3 in place of the auto-playing tour reel.
   *  Absent / empty = keep the reel (the General funnel's behaviour). */
  slide3Core?: FunnelCoreFeature[]
  /** Where completion sends the member: the Beta waitlist (default, the General funnel) or a direct
   *  in-app link (the niche funnels). Absent = waitlist. */
  destination?: FunnelDestination
}

/** Reserved slug for the base VERA flow — what /join runs with no ?seq.
 *  Not a "version" (it never appears in the versions list); its DB override is the
 *  owner's edits from the /pages/splash editor.
 *
 *  The VALUE stays `beta-default` on purpose: it is a STORED key — the slug of the
 *  live `sequence_overrides` row, recorded in every member's `meta.beta.sequence`
 *  and carried by `fq_beta_seq` cookies already in browsers. Renaming it would
 *  orphan the owner's saved default-flow copy and strand mid-flight visitors, so
 *  new saves keep writing the old key (repo convention: beta_audit_log). */
export const DEFAULT_FUNNEL = 'beta-default'

// ── Funnel routing (ADR-funnels): where finishing a funnel lands the new member ──────────────────────
// Owner directive: "The general beta splash funnel should be the only one that goes to the Beta list.
// All other funnels should take them to the section the funnel is targeted at." So the GENERAL splash
// keeps the waitlist/Beta-list landing; each NICHE funnel admits the finished member straight into its
// targeted section. This is the ONE code source for those targets — one row per niche, a pure data edit,
// re-validated at redirect time by isSafeInAppPath / funnelLanding (lib/funnels/destination).

/** The GENERAL beta splash landing: the Beta list (waitlist == the default post-induction feed path). */
export const GENERAL_FUNNEL_DESTINATION: FunnelDestination = { mode: 'waitlist' }

/** The Space-create path for a Space Mode (OPERATOR-FUNNELS §5 Start-free bridge). The finished operator
 *  lands in Create-a-Space pre-seeded in the niche's Mode. `/spaces/new` is the real route today; the
 *  `?mode=<type>:<variant>` hint matches the Mode key (lib/spaces/modes) and is forward-compatible with
 *  the pre-seed bridge. PURE. */
export function spaceCreatePath(mode: { type: string; variant: string }): string {
  return `/spaces/new?mode=${mode.type}:${mode.variant}`
}

/** Space-create destination per operator niche funnel (OPERATOR-FUNNELS §5): coaches -> business:packages,
 *  studios -> business:membership, hosts -> business:ticketed, communities -> business:cohort,
 *  nonprofits -> nonprofit:donations. Keyed by the niche funnel slug (the short /for/<niche> slugs,
 *  ADR-591). One row per niche = one data edit; add a niche here and its funnel routes to its section. */
export const NICHE_FUNNEL_DESTINATIONS: Record<string, FunnelDestination> = {
  coaches: { mode: 'direct', url: spaceCreatePath({ type: 'business', variant: 'packages' }) },
  studios: { mode: 'direct', url: spaceCreatePath({ type: 'business', variant: 'membership' }) },
  hosts: { mode: 'direct', url: spaceCreatePath({ type: 'business', variant: 'ticketed' }) },
  communities: { mode: 'direct', url: spaceCreatePath({ type: 'business', variant: 'cohort' }) },
  nonprofits: { mode: 'direct', url: spaceCreatePath({ type: 'nonprofit', variant: 'donations' }) },
}

/** The funnel destination for a sequence slug: a known niche funnel's Space-create section, else
 *  undefined (the caller keeps the general waitlist/Beta-list landing). PURE. */
export function nicheFunnelDestination(slug: string | null | undefined): FunnelDestination | undefined {
  return (slug && NICHE_FUNNEL_DESTINATIONS[slug]) || undefined
}

// ── Per-sequence GRANTS (ADR-funnels): what finishing a funnel confers on the account ─────────────
// A funnel can honor the people it brings in. The grant is keyed by the ?seq slug (carried to
// signup by the fq_beta_seq cookie, exactly like the cohort tag), so honoring a funnel is a ONE-ROW
// data edit here, never new branching logic. Applied server-side at induction completion
// (app/join/(induction)/actions.ts applyFunnelGrants). Client-safe (pure data).

/** The one-time grant a sequence confers on every account that finishes it. */
export interface FunnelGrant {
  /** Comp the paid Crew tier (profiles.membership_tier = 'crew'). */
  crew?: boolean
  /** Award durable Founding Member status (a founding_members row + is_founding_member), which
   *  lights the gold Founding badge beside their Member badge. No charge (reserve-now). */
  founding?: boolean
  /** A one-time Zap bonus for finishing this funnel (idempotent per profile+seq). The Feature
   *  funnels use this as the "join now, get N Zaps" incentive. */
  zaps?: number
  /** A library Practice to ADOPT for the finisher, by slug.
   *
   *  🔴 WHY A FEATURE FUNNEL NEEDS THIS. `/on-air` renders "Nothing on your list yet — adopt a
   *  practice first" for a member who holds none, so landing a breathwork finisher on the timer
   *  without also giving them the practice lands them on an empty state. The two halves are one
   *  change: the destination below and this grant.
   *
   *  A SLUG, NOT A UUID, because this file is pure data with no database access, and a uuid here
   *  would be an unresolvable magic string that no reader could check. The slug is resolved at
   *  completion (applyFunnelGrants), and a slug that matches nothing is a silent no-op rather
   *  than a failed signup. */
  practiceSlug?: string
}

/** Per-sequence grants, keyed by the ?seq slug. `randy` is the donor onboarding funnel: everyone who
 *  comes through it is honored as a Founding Member and comped Crew, keyed on the SEQUENCE (not email).
 *  `breathwork` is the Feature funnel: finishing it (creating the account that keeps the streak) pays
 *  the advertised 25-Zap welcome bonus. */
export const FUNNEL_GRANTS: Record<string, FunnelGrant> = {
  randy: { crew: true, founding: true },
  breathwork: { zaps: 25, practiceSlug: 'box-breath' },
}

/** The grant for a sequence slug, or undefined when the sequence confers nothing. PURE. */
export function funnelGrant(slug: string | null | undefined): FunnelGrant | undefined {
  return (slug && FUNNEL_GRANTS[slug]) || undefined
}

// The base flow: Vera's scripted copy verbatim. The splash block seeds brand-new
// versions cloned in the builder (the default flow itself has no public splash
// page — visitors enter at /join). The marketing tag stays
// `beta_early_adopter` so the default cohort remains ONE segment across the
// rename (it's the registered trait every default-flow member already carries).
const BASE_FUNNEL: Funnel = {
  slug: DEFAULT_FUNNEL,
  audience: 'Every new member (default)',
  marketingTag: 'beta_early_adopter',
  splash: {
    eyebrow: 'Real community, near you',
    headline: "You're not a user. You're a member.",
    body: 'A place to turn the people near you into real community. Find your Circle, show up in person, and meet the people who live a few streets over.',
    cta: 'Come in',
    image: '/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg',
    imageAlt: 'A Frequency community dancing together outdoors at golden hour, arms raised',
    statement: 'Close the laptop. Show up in *person*.',
  },
  vera: VERA,
  heardAbout: [...HEARD_ABOUT],
  // The GENERAL beta splash is the ONE funnel that keeps the Beta-list landing (waitlist == the
  // default post-induction feed/Beta path). Every NICHE funnel overrides this with a direct section.
  destination: GENERAL_FUNNEL_DESTINATION,
}

// The SPLASH prompts for a brand-new funnel. VERA (the induction beats) already ships as
// fill-in prompts; the base flow's SPLASH, though, is the real live copy, so a funnel
// cloned from it would inherit finished copy. This gives the public splash the same
// fill-in guidance, so a fresh funnel reads as a prompts TEMPLATE end to end. Kept SEPARATE
// from BASE_FUNNEL so seeding a new funnel never reads or mutates the live default flow
// (funnel #1). Plain, no em dashes.
const TEMPLATE_SPLASH_PROMPTS: FunnelSplash = {
  eyebrow: 'Write the kicker above the headline',
  headline: 'Write the headline this audience sees first',
  body: 'Write the short paragraph that says what Frequency is for them',
  cta: 'Write the button label that starts the induction',
  image: '',
  imageAlt: '',
  statement: 'Write the one-line statement (wrap the accent word in *asterisks*)',
}

/** The prompts TEMPLATE a brand-new funnel is seeded from: the SAME structure as the live
 *  default flow (every beat, the splash) but with fill-in prompts for every
 *  content field, so the operator opens the editor to guidance they replace. Built from the
 *  code prompt copy, NOT from the `beta-default` DB override, so creating a funnel can never
 *  touch or depend on the current live flow (funnel #1). Returns a fresh object each call. */
export function templateSeed(): {
  splash: FunnelSplash
  vera: VeraCopy
  heardAbout: string[]
} {
  return {
    splash: { ...TEMPLATE_SPLASH_PROMPTS },
    vera: VERA,
    heardAbout: [...HEARD_ABOUT],
  }
}

/** Code-shipped sequences. Empty since the three launch templates retired — every
 *  audience sequence is now a DB version (sequence_overrides) built in the wizard.
 *  The record stays so a code sequence can be reintroduced without touching callers. */
// The breathwork FEATURE funnel (ADR-619) — the first playable front door. Defined in code (not a
// DB row) because its renderer is code: the box-breath visualizer plays on card 2, captures a lead at
// the first hold, and shows the true first-log reward (Day 1 streak + Zaps). `vera`/`heardAbout`
// are unused by the feature renderer but required by the type, so they borrow the base flow. Lands the
// new member in the app to take their first real round. Voice canon: plain, no em dashes.
const BREATHWORK_FEATURE_FUNNEL: Funnel = {
  slug: 'breathwork',
  style: 'feature',
  feature: { feature: 'breathwork', pattern: 'box', zapsReward: 25 },
  audience: 'Breathwork curious',
  marketingTag: 'beta_breathwork',
  splash: {
    eyebrow: 'Breathwork',
    headline: 'Box breathing, in one round.',
    body: 'Four counts in, hold four, four out, hold four. Follow the ring with your eyes half closed. That is the whole practice.',
    cta: 'Try a round',
    image: '',
    imageAlt: '',
    statement: 'Take one *breath* with us.',
  },
  vera: VERA,
  heardAbout: [...HEARD_ABOUT],
  // Finish ON THE TIMER, breathing for real — not on the feed.
  //
  // 🔴 THIS USED TO BE `/feed?welcome=vera`, and it is the whole of LIVE-134. The button that
  // gets someone here says "Get a Free Timer"; landing them on the community feed is the
  // "I tried to download it and it took me to something else" the owner was reported. The
  // original ADR listed "a deep-link that opens the breath timer directly on landing (today
  // lands at /feed?welcome=vera)" as an open follow-up — this is that follow-up.
  //
  // Bare `/on-air`, not `/on-air?practice=<id>`: this module is pure data with no DB access, so
  // it cannot know the id. It does not need to — the `practiceSlug` grant above adopts the
  // practice at completion, and with exactly one adopted practice the session loader opens it.
  destination: { mode: 'direct', url: '/on-air' },
}

export const FUNNELS: Record<string, Funnel> = {
  breathwork: BREATHWORK_FEATURE_FUNNEL,
}

/** Resolve a CODE Funnel by slug, falling back to the base VERA flow. DB overrides
 *  are merged elsewhere (lib/funnels/resolve.ts) — this stays client-safe. */
export function getFunnel(slug: string | null | undefined): Funnel {
  return (slug && FUNNELS[slug]) || BASE_FUNNEL
}

export function listCodeFunnels(): Funnel[] {
  return Object.values(FUNNELS)
}

/** True when `pathname` is a code Funnel's public splash (`/join/<slug>`). The /join/<x>
 *  segment serves two doors — Funnel splashes and Circle invite tokens — and attribution
 *  must not read a splash landing as a person-driven referral (proxy.ts, channels.ts).
 *  Only CODE Funnels have splashes, so this is knowable synchronously and edge-safe. */
export function isFunnelSplashPath(pathname: string): boolean {
  const m = /^\/join\/([^/?#]+)/.exec(pathname)
  return !!m && m[1] in FUNNELS
}
