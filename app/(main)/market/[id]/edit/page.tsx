import { redirect, notFound } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { getListing } from '@/lib/marketplace'
import { ListingBuilder } from '@/components/studio/market/listing-builder'

export const dynamic = 'force-dynamic'

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profileId = await getMyProfileId()
  if (!profileId) redirect(`/sign-in?next=/market/${id}/edit`)

  const listing = await getListing(id)
  if (!listing) notFound()
  if (listing.author_id !== profileId) notFound() // you can only edit your own

  return (
    <ListingBuilder
      id={listing.id}
      title={listing.title}
      kind={listing.kind}
      category={listing.category}
      priceNote={listing.price_note}
      description={listing.description}
      neighborhood={listing.neighborhood}
      city={listing.city}
      images={listing.images ?? []}
      hasGeo={listing.latitude != null && listing.longitude != null}
    />
  )
}
