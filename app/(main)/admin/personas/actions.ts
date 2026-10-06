'use server'

import { revalidatePath } from 'next/cache'
import type { Database } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { authorizeAction } from '@/lib/admin/guard'
import { logAdminAction } from '@/lib/admin/audit'
import {
  PARTNER_PERSONAS,
  canStaffTransition,
  personaActivationVerdict,
  type PartnerPersona,
  type PersonaState,
} from '@/lib/personas'
import { getConnectStatus } from '@/lib/billing/connect'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { trustSource } from '@/lib/trust'
import { hidePartnerListing, listingProgramLost } from '@/lib/partners/unpublish'

// Staff verification queue (P2.7). A 'profiles'-domain operator (or community janitor)
// runs the claimed → verified → active ladder and can suspend/reinstate. Every move is
// validated against the allowed transitions and recorded (verified_by/at, updated_at).
export async function transitionPersona(
  profileId: string,
  persona: PartnerPersona,
  to: PersonaState,
  notes?: string,
): Promise<ActionResult<{ state: PersonaState }>> {
  const caller = await getCallerProfile()
  try {
    await authorizeAction(caller, 'janitor', 'profiles')
  } catch {
    return fail('Not authorized.')
  }
  if (!PARTNER_PERSONAS.includes(persona)) return fail('Unknown program.')

  const admin = createAdminClient()

  // Read the current state to validate the transition (fail-closed).
  const { data: row } = await admin
    .from('profile_personas')
    .select('state')
    .eq('profile_id', profileId)
    .eq('persona', persona)
    .maybeSingle()
  const from = (row?.state ?? null) as PersonaState | null
  if (!from) return fail('That persona claim no longer exists.')
  if (from === to) return ok({ state: to })
  if (!canStaffTransition(from, to)) return fail(`Can’t move ${from} → ${to}.`)

  const patch: Record<string, unknown> = { state: to, ...(notes !== undefined ? { notes } : {}) }
  if (to === 'verified') {
    patch.verified_at = new Date().toISOString()
    patch.verified_by = caller!.id
  }

  // The payout gate at `active` (LIVE-696, ADR-1676). A money persona goes Active only with the
  // member's Stripe Connect account able to take charges, read fresh here rather than trusted from
  // the page, and activation binds that account id onto the persona row. getConnectStatus degrades
  // a failed read to "no account", so an unreadable account refuses: fail closed.
  if (to === 'active') {
    const connect = await getConnectStatus(profileId)
    const verdict = personaActivationVerdict(persona, {
      accountId: connect.accountId,
      chargesEnabled: connect.chargesEnabled,
    })
    if (!verdict.ok) return fail(verdict.reason)
    if (verdict.bindAccountId) patch.stripe_account_id = verdict.bindAccountId
  }

  const { error } = await admin
    .from('profile_personas')
    .update(patch as Database['public']['Tables']['profile_personas']['Update'])
    .eq('profile_id', profileId)
    .eq('persona', persona)
  if (error) return fail(error.message)

  // Audit the verification decision (P8). Best-effort.
  await logAdminAction({ actorId: caller!.id, action: `persona.${to}`, targetType: 'profile', targetId: profileId, detail: { persona, from } })

  // A verified persona is a trust signal (ADR-247). Emit once per (profile, persona) so
  // suspend→reinstate cycling can't farm it. Best-effort — trust never blocks verification,
  // and this is a safe no-op until the trust_signals table is applied.
  if (to === 'verified') {
    try {
      await trustSource('verification').signal({
        profileId,
        signalType: 'persona_verified',
        idempotencyKey: `persona-verified:${profileId}:${persona}`,
        meta: { persona },
      })
    } catch {
      /* trust emit is best-effort */
    }
  }

  // SCAN-761: suspending the member's last Business or Organization program takes their
  // directory listing and offers down too (same rule as the member's own release).
  if (to === 'suspended' && (await listingProgramLost(persona, profileId))) {
    const hidden = await hidePartnerListing(profileId)
    if ('error' in hidden) return fail(hidden.error)
  }

  // Personas feed the capability resolver — refresh the member's shell + this queue.
  revalidatePath('/', 'layout')
  revalidatePath('/admin/personas')
  return ok({ state: to })
}
