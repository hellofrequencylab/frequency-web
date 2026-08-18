// Partner personas (ADR-163 System 2) — server reader + state machine + metadata. The
// persona axis of the access matrix: a LIVE persona (verified/active) lights up its
// partner surfaces (lib/core/access-matrix.ts). Multi-select, each with a verification
// ladder (claimed → verified → active → suspended, P2.7/ADR-165). The per-persona Stripe
// Connect / money binding (the gate at 'active') is stubbed until Connect lands. Server-
// only (admin client). The `profile_personas` table isn't in the generated types yet, so
// the queries use the untyped-client cast (repo convention, see broadcast/actions.ts).

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
  LIVE_PERSONA_STATES, CONNECT_WIRED, PERSONA_STATE_META, canStaffTransition,
} from './personas-core'
import type { PersonaState } from './personas-core'
import { PARTNER_PERSONAS, LIVE_PERSONA_STATES, isMoneyPersona, CONNECT_WIRED } from './personas-core'

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
  /** The per-persona Stripe Connect / billing account id, when one is bound. Reserved
   *  for the multi-legal-entity case (a separate LLC); dormant until Connect lands. */
  stripeAccountId: string | null
}

/** Every claimed persona with its member, for the staff verification surface.
 *  Newest claim first; pending (claimed) naturally floats to the operator's eye. */
export async function getPersonaQueue(): Promise<PersonaQueueRow[]> {
  const { data } = await (createAdminClient())
    .from('profile_personas')
    .select('persona, state, notes, created_at, verified_at, stripe_account_id, profile:profiles!profile_id ( id, display_name, handle, avatar_url )')
    .order('created_at', { ascending: false })

  return ((data ?? []) as unknown as Array<{
    persona: string
    state: PersonaState
    notes: string | null
    created_at: string
    verified_at: string | null
    stripe_account_id: string | null
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
      stripeAccountId: r.stripe_account_id,
    }))
}

// ── Queue analytics + the dormant payout binding (EM2-5) ─────────────────────

export interface PersonaQueueStats {
  /** Awaiting a verify decision (the operator's to-do count). */
  pending: number
  /** Verified — tools on. */
  verified: number
  /** Active — verified and money-bound (unreachable until Connect lands). */
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

export type ConnectBindingState = 'dormant' | 'pending' | 'bound'

/** The per-persona Stripe Connect / payout binding status for one queue row, for the
 *  operator readout. The binding is the money gate at `active` and is intentionally
 *  DORMANT platform-wide until Connect is wired (CONNECT_WIRED): no row can reach
 *  `active`, so a money persona reads `pending` once verified (waiting on Connect) and
 *  `dormant` before that. `bound` only appears once a real account id is attached. */
export function connectBindingState(row: {
  persona: PartnerPersona
  state: PersonaState
  stripeAccountId: string | null
}): ConnectBindingState {
  if (!isMoneyPersona(row.persona)) return 'dormant'
  if (row.stripeAccountId) return 'bound'
  if (!CONNECT_WIRED) return row.state === 'verified' || row.state === 'active' ? 'pending' : 'dormant'
  return 'dormant'
}

export const CONNECT_BINDING_META: Record<
  ConnectBindingState,
  { label: string; tone: 'pending' | 'success' | 'muted' }
> = {
  dormant: { label: 'Payout binding off', tone: 'muted' },
  pending: { label: 'Payout binding pending Connect', tone: 'pending' },
  bound:   { label: 'Payout bound', tone: 'success' },
}
