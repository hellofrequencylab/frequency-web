// Partner personas (ADR-163 System 2) — server reader + metadata. The persona axis of
// the access matrix: an ACTIVE persona lights up its partner surfaces (lib/core/
// access-matrix.ts). Multi-select; per-persona verification + Stripe/money binding land
// in later P3 increments. Server-only (admin client). The `profile_personas` table
// isn't in the generated types yet, so the queries use the untyped-client cast
// (repo convention, see broadcast/actions.ts).

import type { SupabaseClient } from '@supabase/supabase-js'
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
    tools: [], // featured directory + affiliate dashboard — building (P3.x)
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
      { label: 'Business CRM', href: '/crm' },
      { label: 'Growth Studio', href: '/growth' },
    ],
  },
  organization: {
    label: 'Organization', emoji: '🏢',
    tagline: 'Nonprofits & organizations',
    unlocks: 'Your own sub-community on Hook + CRM + gamification + promotion.',
    tools: [
      { label: 'Business CRM', href: '/crm' },
      { label: 'Growth Studio', href: '/growth' },
    ],
  },
}

function isPersona(v: string): v is PartnerPersona {
  return (PARTNER_PERSONAS as readonly string[]).includes(v)
}

/** Personas a profile actively holds (anything not suspended) — the matrix inputs. */
export async function getActivePersonas(profileId: string): Promise<PartnerPersona[]> {
  const { data } = await (createAdminClient() as unknown as SupabaseClient)
    .from('profile_personas')
    .select('persona, state')
    .eq('profile_id', profileId)
    .neq('state', 'suspended')
  return (data ?? []).map((r: { persona: string }) => r.persona).filter(isPersona)
}

/** Every persona's current state for the management surface (null = not held). */
export async function getPersonaStates(profileId: string): Promise<Record<PartnerPersona, PersonaState | null>> {
  const out: Record<PartnerPersona, PersonaState | null> = {
    collaborator: null, practitioner: null, business: null, organization: null,
  }
  const { data } = await (createAdminClient() as unknown as SupabaseClient)
    .from('profile_personas')
    .select('persona, state')
    .eq('profile_id', profileId)
  for (const r of (data ?? []) as { persona: string; state: PersonaState }[]) {
    if (isPersona(r.persona)) out[r.persona] = r.state
  }
  return out
}
