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

// The money-moving partner programs (ROLES.md System 2): a Practitioner runs paywalled
// Programs (Stripe Connect, verified) and an Organization carries tenant billing. These
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
    unlocks: 'A featured directory for your Practices & Journeys, plus the influencer program (affiliate kickbacks tied to your activity).',
    tools: [
      { label: 'Collaborators directory', href: '/partners/collaborators' },
      { label: 'Create a Journey', href: '/journeys' },
    ],
  },
  practitioner: {
    label: 'Practitioner', emoji: '🧘',
    tagline: 'Healers, breathwork facilitators, yogis running their own network',
    unlocks: 'Host paywalled Programs + gamify your clients’ progress, with a private Channel & Circles under the Frequency brand.',
    tools: [], // paywalled Programs + client gamification — building (P3.x)
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
// of P2.7). The per-persona Stripe Connect binding (activate's money gate) is stubbed.

/** The states whose partner surfaces are live (light the access matrix). */
export const LIVE_PERSONA_STATES: readonly PersonaState[] = ['verified', 'active'] as const

/** Whether the per-persona Stripe Connect / money binding is wired (site-audit BUG-7). Until
 *  Connect lands this is false, so ACTIVATION is blocked everywhere: the verified→active money
 *  gate can't silently succeed without a payment binding. Flip to true when Connect ships.
 *  Note: `verified` already lights every partner surface (LIVE_PERSONA_STATES), so blocking
 *  `active` withholds nothing operational today — it only stops the unbacked money state. */
export const CONNECT_WIRED = false

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

/** Whether a staff operator may move a persona from `from` to `to`. Activation is gated on the
 *  Connect money binding (BUG-7): while it's unwired, no transition to `active` is allowed, so the
 *  state can never be reached without the payment binding. */
export function canStaffTransition(from: PersonaState, to: PersonaState): boolean {
  if (to === 'active' && !CONNECT_WIRED) return false
  return STAFF_TRANSITIONS[from]?.includes(to) ?? false
}
