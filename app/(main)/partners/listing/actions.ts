'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getActivePersonas } from '@/lib/personas'
import { slugify } from '@/lib/utils'
import { type ActionResult, ok, fail } from '@/lib/action-result'

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
