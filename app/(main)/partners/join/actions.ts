'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { PARTNER_PERSONAS, getActivePersonas, type PartnerPersona } from '@/lib/personas'
import { type ActionResult, ok, fail } from '@/lib/action-result'

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

    // A released Business or Organization program takes its directory listing down with it
    // (SCAN-761). The listing and offers used to stay public in /partners and the sitemap while
    // both write paths refused the owner, so nobody could remove them.
    if (persona === 'business' || persona === 'organization') {
      const remaining = await getActivePersonas(me.id)
      if (!remaining.includes('business') && !remaining.includes('organization')) {
        await hidePartnerListing(admin, me.id)
      }
    }
  }

  // Personas feed the capability resolver → refresh the whole shell.
  revalidatePath('/', 'layout')
  return ok()
}

/** Hide the partner listing owned by `profileId` and switch its offers off. Best-effort: a
 *  failure here leaves the persona released and the listing to the owner's Unpublish button. */
async function hidePartnerListing(admin: ReturnType<typeof createAdminClient>, profileId: string): Promise<void> {
  const { data: partner } = await admin
    .from('partners')
    .select('id, slug')
    .eq('contact_profile_id', profileId)
    .maybeSingle()
  if (!partner) return
  await admin.from('partners').update({ status: 'hidden' }).eq('id', partner.id)
  await admin.from('partner_offers').update({ active: false }).eq('partner_id', partner.id)
  revalidatePath('/partners')
  revalidatePath('/discover/partners')
  revalidatePath(`/partners/${partner.slug}`)
}
