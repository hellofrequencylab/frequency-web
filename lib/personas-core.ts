// The partner-persona VOCABULARY and its STATE MACHINE — the half with no database in it.
//
// Split out of lib/personas.ts (LIVE-037). The readers there open the service-role admin client;
// the metadata, the ladder and canStaffTransition are pure. They shared a module, so
// persona-controls.tsx ('use client') importing canStaffTransition pulled the RLS-bypassing
// Supabase client into the admin bundle.
//
// Everything here is re-exported from lib/personas.ts, so every server caller is unchanged.
// CLIENT code must import from HERE.

import type { PartnerPersona } from '@/lib/core/access-matrix'

export type { PartnerPersona }
export type PersonaState = 'claimed' | 'verified' | 'active' | 'suspended'

export const PARTNER_PERSONAS: readonly PartnerPersona[] = [
  'collaborator', 'practitioner', 'business', 'organization',
] as const

// The money-moving partner programs (ROLES.md System 2): a Practitioner sells what they do
// (tickets, products, paid bookings, memberships and Journeys, paid out through Stripe Connect,
// verified) and an Organization carries tenant billing. These
// are the focus of the admin verification queue (EM2-5): their `active` state is the one
// gated on a real per-persona payout binding. The other two programs (Collaborator,
// Business) verify the same way and ride a secondary section of the queue.
export const MONEY_PERSONAS: readonly PartnerPersona[] = ['practitioner', 'organization'] as const

/** Whether a persona's `active` state needs a per-persona Stripe Connect / billing binding. */
export function isMoneyPersona(persona: PartnerPersona): boolean {
  return (MONEY_PERSONAS as readonly string[]).includes(persona)
}

export type PersonaTool = { label: string; href: string }

export const PERSONA_META: Record<
  PartnerPersona,
  { label: string; emoji: string; tagline: string; unlocks: string; tools: PersonaTool[] }
> = {
  collaborator: {
    label: 'Collaborator', emoji: '📣',
    tagline: 'Influencers, authors, teachers, speakers with an audience',
    unlocks: 'A featured directory for your Practices & Journeys, plus the influencer program: rewards for the members you bring in, never a cut of what they spend.',
    tools: [
      { label: 'Collaborators directory', href: '/partners/collaborators' },
      { label: 'Create a Journey', href: '/journeys' },
    ],
  },
  practitioner: {
    label: 'Practitioner', emoji: '🧘',
    tagline: 'Healers, breathwork facilitators, yogis running their own network',
    // LIVE-709 (ADR-1675): this line promised "paywalled Programs", which nothing can sell. It now
    // names only money paths that are live (lib/billing/payout-prompt.ts PAYOUT_CHANNELS) and the
    // rule each one runs on: tickets and Market products sell from any account (ADR-914), bookings
    // and memberships need a Space, and only a paid Space may price a Journey (ADR-1397). Every tool
    // below opens a real page; lib/personas-practitioner-promise.test.ts holds both halves.
    unlocks: 'Get paid for what you already do. Sell tickets to your events and list products in the Market from any account. Open a Space to take paid bookings and sell memberships, and once it’s on a paid plan, sell your Journeys.',
    tools: [
      { label: 'Host an event', href: '/events/new' },
      { label: 'List a product', href: '/market/sell' },
      { label: 'Open a Space', href: '/spaces/new' },
      { label: 'Receive payments', href: '/settings#payouts' },
    ],
  },
  business: {
    label: 'Business', emoji: '🏪',
    tagline: 'Local businesses',
    unlocks: 'A business listing + loyalty rewards + CRM + web builder.',
    tools: [
      { label: 'Your listing', href: '/partners/listing' },
      { label: 'Business CRM', href: '/admin/growth?tab=crm' },
      { label: 'Growth Studio', href: '/admin/growth' },
    ],
  },
  organization: {
    label: 'Organization', emoji: '🏢',
    tagline: 'Nonprofits & organizations',
    unlocks: 'Your own sub-community on Hook + CRM + gamification + promotion.',
    tools: [
      { label: 'Your listing', href: '/partners/listing' },
      { label: 'Business CRM', href: '/admin/growth?tab=crm' },
      { label: 'Growth Studio', href: '/admin/growth' },
    ],
  },
}

// ── State machine (P2.7) ─────────────────────────────────────────────────────
// claimed → verified → active → suspended. A member self-serves the claim/release;
// a staff operator runs the verify → activate ladder (and can suspend/reinstate).
// "Lit" = the persona's matrix surfaces are on. Only VERIFIED + ACTIVE light up —
// a bare claim is pending review, so partner tools wait on verification (the point
// of P2.7). Activating a money persona binds its member's Stripe Connect account and is
// refused without one that can take charges (LIVE-696, personaActivationVerdict below).

/** The states whose partner surfaces are live (light the access matrix). */
export const LIVE_PERSONA_STATES: readonly PersonaState[] = ['verified', 'active'] as const

export const PERSONA_STATE_META: Record<
  PersonaState,
  { label: string; tone: 'pending' | 'success' | 'muted'; desc: string }
> = {
  claimed:   { label: 'Pending review', tone: 'pending', desc: 'Claimed. Waiting on the team to verify.' },
  verified:  { label: 'Verified',       tone: 'success', desc: 'Confirmed by the team; tools are on.' },
  active:    { label: 'Active',          tone: 'success', desc: 'Fully live, verified and bound.' },
  suspended: { label: 'Suspended',       tone: 'muted',   desc: 'Released or revoked.' },
}

// Staff-driven transitions (the admin verify queue). Member self-serve claim/release
// are separate (claimPersona / releasePersona).
const STAFF_TRANSITIONS: Record<PersonaState, readonly PersonaState[]> = {
  claimed:   ['verified', 'suspended'],
  verified:  ['active', 'suspended'],
  active:    ['suspended'],
  suspended: ['verified'], // reinstate without forcing a re-claim
}

/** Whether the ladder lets a staff operator move a persona from `from` to `to`. The ladder only:
 *  activating a money persona is ALSO gated on a payout account, which the ladder cannot see, so
 *  every activate path asks personaActivationVerdict as well (LIVE-696). */
export function canStaffTransition(from: PersonaState, to: PersonaState): boolean {
  return STAFF_TRANSITIONS[from]?.includes(to) ?? false
}

// ── The payout gate at `active` (LIVE-696, ADR-1676) ─────────────────────────
// A money persona (Practitioner, Organization) goes Active only with a Stripe Connect account
// behind it that can take charges. That account is the member's ONE Connect account
// (profiles.stripe_account_id, lib/billing/connect.ts), the same one every money path pays out
// to, so there is no second onboarding: activation binds its id onto the persona row
// (profile_personas.stripe_account_id). Collaborator and Business take no money and carry no
// binding, so the ladder alone decides them.

/** The member's mirrored Connect flags, as much of them as the gate reads. */
export interface PersonaPayout {
  accountId: string | null
  chargesEnabled: boolean
}

/** Where the member adds the account: the Receive payments card on /settings, the same deep link
 *  the nav registry uses. NOT /settings/billing#payouts: that route redirects with its own `#plan`
 *  fragment unless a `?payouts=` query rides along, so the member would land on the plan card. */
export const PERSONA_PAYOUT_HREF = '/settings#payouts'

/** What an operator reads when Activate is refused. Names the fix and where it lives. */
export const PERSONA_NEEDS_PAYOUT =
  'This member has no payout account that can take money yet. They add one in Settings under Receive payments, then you can activate.'

export type PersonaActivationVerdict =
  | { ok: true; bindAccountId: string | null }
  | { ok: false; reason: string }

/** May this persona go Active with this payout account behind it? PURE and total. A money persona
 *  needs an account id AND charges enabled, and the verdict carries the id to bind. Anything else
 *  (no account, an unfinished one, or null for a read that failed) is refused. Fail closed: an
 *  Active seller with nowhere for the money to land is the defect this gate exists for. */
export function personaActivationVerdict(
  persona: PartnerPersona,
  payout: PersonaPayout | null,
): PersonaActivationVerdict {
  if (!isMoneyPersona(persona)) return { ok: true, bindAccountId: null }
  if (payout?.accountId && payout.chargesEnabled) return { ok: true, bindAccountId: payout.accountId }
  return { ok: false, reason: PERSONA_NEEDS_PAYOUT }
}

/** Whether a verified persona is waiting on its member's payout account before it can go Active.
 *  The one case the member is prompted to add one (/partners/join) and the operator's Activate
 *  button stays off (/admin/personas). */
export function awaitingPayout(
  persona: PartnerPersona,
  state: PersonaState,
  payout: PersonaPayout | null,
): boolean {
  return state === 'verified' && !personaActivationVerdict(persona, payout).ok
}
