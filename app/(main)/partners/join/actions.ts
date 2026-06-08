'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { PARTNER_PERSONAS, type PartnerPersona } from '@/lib/personas'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Self-serve partner persona toggle. Beta: joining activates the persona immediately
// (so its matrix surfaces light up); verification + Stripe/money binding for the
// money-moving programs land in later P3 increments. Suspending releases it.
export async function setPersona(persona: PartnerPersona, active: boolean): Promise<ActionResult<void>> {
  const me = await getCallerProfile()
  if (!me) return fail('Sign in first.')
  if (!PARTNER_PERSONAS.includes(persona)) return fail('Unknown program.')

  const admin = createAdminClient() as unknown as SupabaseClient
  if (active) {
    const { error } = await admin
      .from('profile_personas')
      .upsert({ profile_id: me.id, persona, state: 'active' }, { onConflict: 'profile_id,persona' })
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
