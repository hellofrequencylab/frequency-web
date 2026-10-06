'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { PARTNER_PERSONAS, type PartnerPersona } from '@/lib/personas'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { hidePartnerListing, listingProgramLost } from '@/lib/partners/unpublish'

// Self-serve partner persona claim/release (P2.7, ADR-163 System 2). Claiming lands
// the persona in 'claimed' (pending review) — a staff operator verifies it from the
// admin queue before its surfaces light up. Releasing suspends it. A member never sets
// 'active' here: staff activate, and a money persona needs its payout account first (LIVE-696).
export async function setPersona(persona: PartnerPersona, claim: boolean): Promise<ActionResult<void>> {
  const me = await getCallerProfile()
  if (!me) return fail('Sign in first.')
  if (!PARTNER_PERSONAS.includes(persona)) return fail('Unknown program.')

  const admin = createAdminClient()
  if (claim) {
    // Claim (or re-claim a suspended one): back to pending review, clearing any
    // prior verification so it's re-vetted.
    const { error } = await admin
      .from('profile_personas')
      .upsert(
        { profile_id: me.id, persona, state: 'claimed', verified_at: null, verified_by: null },
        { onConflict: 'profile_id,persona' },
      )
    if (error) return fail(error.message)
  } else {
    const { error } = await admin
      .from('profile_personas')
      .update({ state: 'suspended' })
      .eq('profile_id', me.id)
      .eq('persona', persona)
    if (error) return fail(error.message)

    // SCAN-761: the directory reads partners.status, not the persona, and the listing writers
    // refuse a caller without a live Business or Organization program. Releasing the last of
    // those takes the listing and its offers down with it, or it stays public with no owner
    // door to remove it.
    if (await listingProgramLost(persona, me.id)) {
      const hidden = await hidePartnerListing(me.id)
      if ('error' in hidden) return fail(hidden.error)
    }
  }

  // Personas feed the capability resolver → refresh the whole shell.
  revalidatePath('/', 'layout')
  return ok()
}
