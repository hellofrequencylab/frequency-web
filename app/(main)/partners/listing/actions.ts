'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getActivePersonas } from '@/lib/personas'
import { slugify } from '@/lib/utils'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { buildOfferRow, type OfferInput } from '@/lib/partners/offers'
import { hidePartnerListing } from '@/lib/partners/unpublish'

export interface ListingInput {
  name: string
  category: string
  city: string
  description: string
  address: string
  website: string
}

// A Business / Organization partner manages their own directory listing (the row that
// appears in /partners). One listing per profile, keyed by partners.contact_profile_id.
// Beta: saving publishes immediately (status 'active'); approval/verification later.
export async function saveListing(input: ListingInput): Promise<ActionResult<{ slug: string }>> {
  const me = await getCallerProfile()
  if (!me) return fail('Sign in first.')

  const personas = await getActivePersonas(me.id)
  if (!personas.includes('business') && !personas.includes('organization')) {
    return fail('A Business or Organization program is required.')
  }

  const name = input.name.trim()
  if (!name) return fail('A name is required.')

  const admin = createAdminClient()
  const fields = {
    name,
    category: input.category.trim() || null,
    city: input.city.trim() || null,
    description: input.description.trim() || null,
    address: input.address.trim() || null,
    website: input.website.trim() || null,
    contact_profile_id: me.id,
    status: 'active',
  }

  const { data: existing } = await admin
    .from('partners')
    .select('id, slug')
    .eq('contact_profile_id', me.id)
    .maybeSingle()

  if (existing) {
    const { error } = await admin.from('partners').update(fields).eq('id', existing.id)
    if (error) return fail(error.message)
    revalidatePath('/partners')
    revalidatePath('/partners/listing')
    return ok({ slug: existing.slug })
  }

  // New listing — generate a unique slug from the name.
  let slug = slugify(name)
  const { data: clash } = await admin.from('partners').select('id').eq('slug', slug).maybeSingle()
  if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 5)}`

  const { error } = await admin.from('partners').insert({ ...fields, slug })
  if (error) return fail(error.message)
  revalidatePath('/partners')
  revalidatePath('/partners/listing')
  return ok({ slug })
}

// Take the listing down (SCAN-761). Keyed only on partners.contact_profile_id = caller, with no
// persona gate on purpose: an owner can always remove their own listing, even after the program
// that let them publish it is released or suspended. Saving the listing again republishes it.
export async function unpublishListing(): Promise<ActionResult<void>> {
  const me = await getCallerProfile()
  if (!me) return fail('Sign in first.')
  const hidden = await hidePartnerListing(me.id)
  if ('error' in hidden) return fail(hidden.error)
  if (hidden.slugs.length === 0) return fail('You have no listing to take down.')
  return ok()
}

// Offers (scan2 L9-04, 2026-09-05). partner_offers had a reader and no writer, so the "Member
// offers" section on /partners/[slug] was always empty. Same gate as the listing: the caller must
// hold a Business or Organization program and the offer must belong to THEIR partner row (keyed by
// partners.contact_profile_id), so an id from someone else's listing is refused, not edited.
export async function saveOffer(input: OfferInput): Promise<ActionResult<{ id: string }>> {
  const me = await getCallerProfile()
  if (!me) return fail('Sign in first.')

  const personas = await getActivePersonas(me.id)
  if (!personas.includes('business') && !personas.includes('organization')) {
    return fail('A Business or Organization program is required.')
  }

  const built = buildOfferRow(input)
  if (!built.ok) return fail(built.error)

  const admin = createAdminClient()
  const { data: partner, error: partnerError } = await admin
    .from('partners')
    .select('id, slug')
    .eq('contact_profile_id', me.id)
    .maybeSingle()
  if (partnerError) return fail(partnerError.message)
  if (!partner) return fail('Publish your listing first, then add an offer to it.')

  // LIVE-673: a sponsor reward names a live Quest. Refuse an id that is not one rather than store it.
  if (built.row.quest_id) {
    const { data: quest } = await admin.from('quests').select('id').eq('id', built.row.quest_id).eq('status', 'active').maybeSingle()
    if (!quest) return fail('Pick a Quest that is running now, or leave it empty.')
  }

  let id: string
  if (input.id) {
    const { data: updated, error } = await admin
      .from('partner_offers')
      .update(built.row)
      .eq('id', input.id)
      .eq('partner_id', partner.id)
      .select('id')
      .maybeSingle()
    if (error) return fail(error.message)
    if (!updated) return fail('That offer is not on your listing.')
    id = updated.id
  } else {
    const { data: inserted, error } = await admin
      .from('partner_offers')
      .insert({ ...built.row, partner_id: partner.id })
      .select('id')
      .single()
    if (error) return fail(error.message)
    id = inserted.id
  }

  revalidatePath('/partners')
  revalidatePath('/partners/listing')
  revalidatePath(`/partners/${partner.slug}`)
  return ok({ id })
}
