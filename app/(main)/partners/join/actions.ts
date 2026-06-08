'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { PARTNER_PERSONAS, type PartnerPersona } from '@/lib/personas'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Self-serve partner persona claim/release (P2.7, ADR-163 System 2). Claiming lands
// the persona in 'claimed' (pending review) — a staff operator verifies it from the
// admin queue before its surfaces light up. Releasing suspends it. The per-persona
// Stripe Connect binding (the money gate at 'active') is stubbed until Connect lands.
export async function setPersona(persona: PartnerPersona, claim: boolean): Promise<ActionResult<void>> {
  const me = await getCallerProfile()
  if (!me) return fail('Sign in first.')
  if (!PARTNER_PERSONAS.includes(persona)) return fail('Unknown program.')

  const admin = createAdminClient() as unknown as SupabaseClient
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
  }

  // Personas feed the capability resolver → refresh the whole shell.
  revalidatePath('/', 'layout')
  return ok()
}
