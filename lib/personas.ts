// Partner personas (ADR-163 System 2) — server reader + state machine + metadata. The
// persona axis of the access matrix: a LIVE persona (verified/active) lights up its
// partner surfaces (lib/core/access-matrix.ts). Multi-select, each with a verification
// ladder (claimed → verified → active → suspended, P2.7/ADR-165). The per-persona Stripe
// Connect / money binding (the gate at 'active') is stubbed until Connect lands. Server-
// only (admin client). The `profile_personas` table isn't in the generated types yet, so
// the queries use the untyped-client cast (repo convention, see broadcast/actions.ts).

import { createAdminClient } from '@/lib/supabase/admin'
import type { PartnerPersona } from '@/lib/core/access-matrix'

export type { PartnerPersona }
export type PersonaState = 'claimed' | 'verified' | 'active' | 'suspended'

export const PARTNER_PERSONAS: readonly PartnerPersona[] = [
  'collaborator', 'practitioner', 'business', 'organization',
] as const

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

function isPersona(v: string): v is PartnerPersona {
  return (PARTNER_PERSONAS as readonly string[]).includes(v)
}

// ── State machine (P2.7) ─────────────────────────────────────────────────────
// claimed → verified → active → suspended. A member self-serves the claim/release;
// a staff operator runs the verify → activate ladder (and can suspend/reinstate).
// "Lit" = the persona's matrix surfaces are on. Only VERIFIED + ACTIVE light up —
// a bare claim is pending review, so partner tools wait on verification (the point
// of P2.7). The per-persona Stripe Connect binding (activate's money gate) is stubbed.

/** The states whose partner surfaces are live (light the access matrix). */
export const LIVE_PERSONA_STATES: readonly PersonaState[] = ['verified', 'active'] as const

export const PERSONA_STATE_META: Record<
  PersonaState,
  { label: string; tone: 'pending' | 'success' | 'muted'; desc: string }
> = {
  claimed:   { label: 'Pending review', tone: 'pending', desc: 'Claimed — waiting on the team to verify.' },
  verified:  { label: 'Verified',       tone: 'success', desc: 'Confirmed by the team; tools are on.' },
  active:    { label: 'Active',          tone: 'success', desc: 'Fully live — verified and bound.' },
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

/** Whether a staff operator may move a persona from `from` to `to`. */
export function canStaffTransition(from: PersonaState, to: PersonaState): boolean {
  return STAFF_TRANSITIONS[from]?.includes(to) ?? false
}

/** Personas whose surfaces are LIVE (verified/active) — the matrix inputs. A bare
 *  `claimed` is pending and does NOT light surfaces; `suspended` is off. */
export async function getActivePersonas(profileId: string): Promise<PartnerPersona[]> {
  const { data } = await (createAdminClient())
    .from('profile_personas')
    .select('persona, state')
    .eq('profile_id', profileId)
    .in('state', LIVE_PERSONA_STATES as unknown as string[])
  return (data ?? []).map((r: { persona: string }) => r.persona).filter(isPersona)
}

/** Every persona's current state for the management surface (null = not held). */
export async function getPersonaStates(profileId: string): Promise<Record<PartnerPersona, PersonaState | null>> {
  const out: Record<PartnerPersona, PersonaState | null> = {
    collaborator: null, practitioner: null, business: null, organization: null,
  }
  const { data } = await (createAdminClient())
    .from('profile_personas')
    .select('persona, state')
    .eq('profile_id', profileId)
  for (const r of (data ?? []) as { persona: string; state: PersonaState }[]) {
    if (isPersona(r.persona)) out[r.persona] = r.state
  }
  return out
}

// ── Admin verification queue (P2.7) ──────────────────────────────────────────

export interface PersonaQueueRow {
  profileId: string
  displayName: string
  handle: string | null
  avatarUrl: string | null
  persona: PartnerPersona
  state: PersonaState
  notes: string | null
  createdAt: string
  verifiedAt: string | null
}

/** Every claimed persona with its member, for the staff verification surface.
 *  Newest claim first; pending (claimed) naturally floats to the operator's eye. */
export async function getPersonaQueue(): Promise<PersonaQueueRow[]> {
  const { data } = await (createAdminClient())
    .from('profile_personas')
    .select('persona, state, notes, created_at, verified_at, profile:profiles!profile_id ( id, display_name, handle, avatar_url )')
    .order('created_at', { ascending: false })

  return ((data ?? []) as unknown as Array<{
    persona: string
    state: PersonaState
    notes: string | null
    created_at: string
    verified_at: string | null
    profile: { id: string; display_name: string | null; handle: string | null; avatar_url: string | null } | null
  }>)
    .filter((r) => r.profile && isPersona(r.persona))
    .map((r) => ({
      profileId: r.profile!.id,
      displayName: r.profile!.display_name ?? 'Unnamed',
      handle: r.profile!.handle,
      avatarUrl: r.profile!.avatar_url,
      persona: r.persona as PartnerPersona,
      state: r.state,
      notes: r.notes,
      createdAt: r.created_at,
      verifiedAt: r.verified_at,
    }))
}
