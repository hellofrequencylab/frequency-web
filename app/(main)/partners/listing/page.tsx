import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getActivePersonas } from '@/lib/personas'
import { createAdminClient } from '@/lib/supabase/admin'
import { FocusTemplate } from '@/components/templates'
import { listOffersOfPartner } from '@/lib/partners/read'
import { ListingForm } from './listing-form'
import { OffersSection } from './offers-section'

export const dynamic = 'force-dynamic'

// A Business / Organization partner's directory listing manager (P3.3). Gated to those
// personas; the saved row appears in the public /partners directory.
export default async function PartnerListingPage() {
  const me = await getCallerProfile()
  if (!me) redirect('/sign-in?next=/partners/listing')

  const personas = await getActivePersonas(me.id)
  if (!personas.includes('business') && !personas.includes('organization')) redirect('/partners/join')

  const { data: listing } = await createAdminClient()
    .from('partners')
    .select('id, name, category, city, description, address, website')
    .eq('contact_profile_id', me.id)
    .maybeSingle()

  // Offers ride the listing (scan2 L9-04): none to show until the listing row exists.
  const offers = listing ? await listOffersOfPartner(listing.id) : []

  return (
    <FocusTemplate
      title="Your listing"
      description="How your business shows up in the member directory. Walk-ins find you here and claim a members-only offer."
      back={{ href: '/partners/join', label: 'Partner programs' }}
      width="wide"
    >
      <ListingForm initial={listing ?? null} />
      {listing && <OffersSection offers={offers} />}
    </FocusTemplate>
  )
}
