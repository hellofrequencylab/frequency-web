'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { approveOffer, bindPass, withdrawOffer } from '@/lib/hunts/commerce-admin'
import { huntSwitchOn } from '@/lib/hunts/flags'

// The organizer actions for Hunt commerce (FH-036S, FH-038S). Each one establishes the caller itself, refuses
// while HUNTS_COMMERCE_ENABLED is off, and passes the Hunt gate inside lib/hunts/commerce-admin.ts. A browser
// supplies only ids and benefit codes; the seller, the version, the Event and every price are read there.

const UUID = /^[0-9a-f-]{36}$/i

async function caller(huntId: string): Promise<string | null> {
  if (!huntSwitchOn('commerce') || !UUID.test(huntId)) return null
  return (await getCallerProfile())?.id ?? null
}

function done(huntId: string) {
  revalidatePath(`/hunts/edit/${huntId}/commerce`)
}

export async function bindPassAction(formData: FormData): Promise<void> {
  const huntId = String(formData.get('huntId') ?? '')
  const profileId = await caller(huntId)
  const tier = String(formData.get('ticketTypeId') ?? '')
  if (!profileId || !UUID.test(tier)) return
  const codes = formData.getAll('benefit').map(String)
  const out = await bindPass(huntId, profileId, tier, codes)
  if (!out.ok) throw new Error(out.error)
  done(huntId)
}

export async function approveOfferAction(formData: FormData): Promise<void> {
  const huntId = String(formData.get('huntId') ?? '')
  const profileId = await caller(huntId)
  const product = String(formData.get('productId') ?? '')
  if (!profileId || !UUID.test(product)) return
  const code = String(formData.get('benefitCode') ?? '')
  const state = formData.get('requiresState') === 'fulfilled' ? 'fulfilled' : 'paid'
  const out = await approveOffer(huntId, profileId, product, code || null, state)
  if (!out.ok) throw new Error(out.error)
  done(huntId)
}

export async function withdrawOfferAction(formData: FormData): Promise<void> {
  const huntId = String(formData.get('huntId') ?? '')
  const profileId = await caller(huntId)
  const offer = String(formData.get('offerId') ?? '')
  if (!profileId || !UUID.test(offer)) return
  const out = await withdrawOffer(huntId, profileId, offer)
  if (!out.ok) throw new Error(out.error)
  done(huntId)
}
