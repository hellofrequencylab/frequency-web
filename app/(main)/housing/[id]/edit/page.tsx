import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getMyProfileId } from '@/lib/auth'
import { getListing } from '@/lib/listings'
import { getHousingDetail } from '@/lib/listings/housing'
import { HousingForm, type HousingFormInitial } from '../../new/housing-form'
import { updateHousingListingAction } from './actions'

// Edit a housing listing — the same Focus compose surface as /new, prefilled, with the
// update action bound to this listing. Gate: the signed-in OWNER only; everyone else
// (signed-out, wrong member, wrong vertical) gets a 404, mirroring the classifieds edit
// route. Like /new, a Focus form that keeps the global rail beside its centered body.

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Edit housing listing' }

export default async function EditHousingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [profileId, listing] = await Promise.all([getMyProfileId(), getListing(id)])
  if (!profileId) notFound()
  if (!listing || listing.vertical !== 'housing') notFound()
  if (listing.ownerProfileId !== profileId) notFound() // you can only edit your own

  const detail = await getHousingDetail(id)

  // Merge the base row + housing extension into the form's prefill shape (money in
  // dollars, matching what the inputs show).
  const initial: HousingFormInitial = {
    title: listing.title,
    listingType: detail?.listingType ?? 'rental',
    propertyType: detail?.propertyType ?? null,
    roomType: detail?.roomType ?? null,
    sqft: detail?.sqft ?? null,
    rentDollars: detail?.rentCents != null ? Math.round(detail.rentCents / 100) : null,
    depositDollars: detail?.depositCents != null ? Math.round(detail.depositCents / 100) : null,
    leaseMonths: detail?.leaseMonths ?? null,
    bedrooms: detail?.bedrooms ?? null,
    bathrooms: detail?.bathrooms ?? null,
    householdSize: detail?.householdSize ?? null,
    availableFrom: detail?.availableFrom ?? null,
    neighborhood: listing.neighborhood,
    city: listing.city,
    amenities: detail?.amenities ?? [],
    furnished: detail?.furnished ?? false,
    utilitiesIncluded: detail?.utilitiesIncluded ?? false,
    petsOk: detail?.petsOk ?? false,
    smokingOk: detail?.smokingOk ?? false,
    cannabisOk: detail?.cannabisOk ?? false,
    description: listing.description,
    images: listing.images,
  }

  return (
    <FocusTemplate
      title="Edit your listing"
      description="Update the details, photos, or price. Changes go live as soon as you save."
      back={{ href: `/housing/${id}`, label: listing.title }}
      width="wide"
    >
      <HousingForm initial={initial} action={updateHousingListingAction.bind(null, id)} />
    </FocusTemplate>
  )
}
