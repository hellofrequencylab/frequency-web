// Taking a partner listing out of the public directory (SCAN-761). Server-only.
//
// The directory (/partners, /discover/partners, the sitemap) reads `partners.status = 'active'`
// and never looks at the owner's persona, while the listing writers refuse a caller without a
// live Business or Organization program. So a released or suspended program left its listing
// and offers public with no way to take them down. This is the one write that hides them:
// the release action, the staff suspend door and the owner's own unpublish all call it.

import 'server-only'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActivePersonas } from '@/lib/personas'

/** `partners.status` for a listing taken down (the column's own vocabulary: pending | active | inactive). */
export const HIDDEN_PARTNER_STATUS = 'inactive'

/** Hide every listing the profile owns and pause its offers. Returns the slugs it hid (none is
 *  fine: the member may never have published). Saving the listing again republishes it. */
export async function hidePartnerListing(profileId: string): Promise<{ slugs: string[] } | { error: string }> {
  const admin = createAdminClient()
  const { data: rows, error: readError } = await admin
    .from('partners')
    .select('id, slug')
    .eq('contact_profile_id', profileId)
  if (readError) return { error: readError.message }
  const listings = (rows ?? []) as { id: string; slug: string }[]
  if (listings.length === 0) return { slugs: [] }

  const ids = listings.map((p) => p.id)
  const { error: hideError } = await admin
    .from('partners')
    .update({ status: HIDDEN_PARTNER_STATUS })
    .in('id', ids)
  if (hideError) return { error: hideError.message }

  const { error: offersError } = await admin
    .from('partner_offers')
    .update({ active: false })
    .in('partner_id', ids)
  if (offersError) return { error: offersError.message }

  revalidatePath('/partners')
  revalidatePath('/partners/listing')
  revalidatePath('/discover/partners')
  for (const p of listings) {
    revalidatePath(`/partners/${p.slug}`)
    revalidatePath(`/discover/partners/${p.slug}`)
  }
  return { slugs: listings.map((p) => p.slug) }
}

/** Whether a persona change leaves the profile with no live listing program. A Business or
 *  Organization program carries the listing; losing the last of the two takes the listing down,
 *  losing one while the other is still live does not. */
export async function listingProgramLost(persona: string, profileId: string): Promise<boolean> {
  if (persona !== 'business' && persona !== 'organization') return false
  const live = await getActivePersonas(profileId)
  return !live.includes('business') && !live.includes('organization')
}
