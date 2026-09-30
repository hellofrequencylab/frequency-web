// Partner personas (ADR-163 System 2) — server reader + state machine + metadata. The
// persona axis of the access matrix: a LIVE persona (verified/active) lights up its
// partner surfaces (lib/core/access-matrix.ts). Multi-select, each with a verification
// ladder (claimed → verified → active → suspended, P2.7/ADR-165). A money persona goes
// 'active' only with its member's Stripe Connect account able to take charges, and activation
// binds that account onto the persona row (LIVE-696, personaActivationVerdict). Server-only
// (admin client).

// ── `import 'server-only'` IS THE POINT OF THE LINE BELOW, NOT DECORATION (LIVE-037) ──────────
// The header above already said "Server-only (admin client)." A comment enforces nothing:
// persona-controls.tsx imported the state machine from here and shipped the service-role client
// to the browser. The directive makes that a BUILD FAILURE that names the importer.
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PartnerPersona } from '@/lib/core/access-matrix'

// The vocabulary + state machine live in ./personas-core (dependency-free) so client components
// can read them without dragging this module's admin client into the browser (LIVE-037).
// Re-exported here so every existing server caller is unchanged.
export type { PartnerPersona, PersonaState, PersonaTool } from './personas-core'
export {
  PARTNER_PERSONAS, MONEY_PERSONAS, isMoneyPersona, PERSONA_META,
  LIVE_PERSONA_STATES, PERSONA_STATE_META, canStaffTransition,
  personaActivationVerdict, awaitingPayout, PERSONA_NEEDS_PAYOUT, PERSONA_PAYOUT_HREF,
} from './personas-core'
export type { PersonaPayout, PersonaActivationVerdict } from './personas-core'
import type { PersonaState, PersonaPayout } from './personas-core'
import { PARTNER_PERSONAS, LIVE_PERSONA_STATES, isMoneyPersona, personaActivationVerdict } from './personas-core'

function isPersona(v: string): v is PartnerPersona {
  return (PARTNER_PERSONAS as readonly string[]).includes(v)
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
  /** The Stripe Connect account bound to this persona when it went Active (LIVE-696). */
  stripeAccountId: string | null
  /** The member's own Connect account (profiles.stripe_*), which activation checks and binds. */
  ownerPayout: PersonaPayout
}

/** Every claimed persona with its member, for the staff verification surface.
 *  Newest claim first; pending (claimed) naturally floats to the operator's eye. */
export async function getPersonaQueue(): Promise<PersonaQueueRow[]> {
  const { data } = await (createAdminClient())
    .from('profile_personas')
    .select('persona, state, notes, created_at, verified_at, stripe_account_id, profile:profiles!profile_id ( id, display_name, handle, avatar_url, stripe_account_id, stripe_charges_enabled )')
    .order('created_at', { ascending: false })

  return ((data ?? []) as unknown as Array<{
    persona: string
    state: PersonaState
    notes: string | null
    created_at: string
    verified_at: string | null
    stripe_account_id: string | null
    profile: {
      id: string
      display_name: string | null
      handle: string | null
      avatar_url: string | null
      stripe_account_id: string | null
      stripe_charges_enabled: boolean | null
    } | null
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
      stripeAccountId: r.stripe_account_id,
      ownerPayout: {
        accountId: r.profile!.stripe_account_id,
        chargesEnabled: !!r.profile!.stripe_charges_enabled,
      },
    }))
}

// ── Queue analytics + the payout binding readout (EM2-5, LIVE-696) ───────────

interface PersonaQueueStats {
  /** Awaiting a verify decision (the operator's to-do count). */
  pending: number
  /** Verified — tools on. */
  verified: number
  /** Active — verified and, for a money persona, bound to a payout account. */
  active: number
  /** Released or revoked. */
  suspended: number
}

/** Headline counts for the verification dashboard band. Pure over a fetched queue. */
export function personaQueueStats(rows: readonly PersonaQueueRow[]): PersonaQueueStats {
  const stats: PersonaQueueStats = { pending: 0, verified: 0, active: 0, suspended: 0 }
  for (const r of rows) {
    if (r.state === 'claimed') stats.pending += 1
    else stats[r.state] += 1
  }
  return stats
}

type ConnectBindingState = 'none' | 'needs_account' | 'ready' | 'bound'

/** The payout binding status for one queue row, for the operator readout (LIVE-696). A
 *  non-money persona carries no binding (`none`). A money persona reads `bound` once activation
 *  attached an account, `ready` when its member's account can take charges (Activate will bind
 *  it), and `needs_account` otherwise: the member has to add one at /settings#payouts first. */
export function connectBindingState(row: {
  persona: PartnerPersona
  stripeAccountId: string | null
  ownerPayout: PersonaPayout | null
}): ConnectBindingState {
  if (!isMoneyPersona(row.persona)) return 'none'
  if (row.stripeAccountId) return 'bound'
  return personaActivationVerdict(row.persona, row.ownerPayout).ok ? 'ready' : 'needs_account'
}

export const CONNECT_BINDING_META: Record<
  ConnectBindingState,
  { label: string; tone: 'pending' | 'success' | 'muted' }
> = {
  none:          { label: 'No payout binding', tone: 'muted' },
  needs_account: { label: 'No payout account yet', tone: 'pending' },
  ready:         { label: 'Payout account ready', tone: 'success' },
  bound:         { label: 'Payout bound', tone: 'success' },
}
