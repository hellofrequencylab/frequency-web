import type { Metadata } from 'next'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getListingWithOwner } from '@/lib/listings'
import {
  accessibilityLabel,
  amenityLabel,
  getHousingDetail,
  laundryLabel,
  parkingLabel,
  propertyTypeLabel,
  resolveAddressDisplay,
} from '@/lib/listings/housing'
import { ReportButton } from '@/components/marketplace/report-button'
import { SaveListingButton } from '@/components/marketplace/save-listing-button'
import { ListingDetailTemplate } from '@/components/templates/listing-detail-template'
import { listingDetailFromHousing } from '@/lib/listings-shared/detail-view'
import { listingMetadata, type HousingSeoFacts } from '@/lib/listings-shared/listing-seo'
import { getListingComments } from '@/lib/marketplace/listing-comments'
import { ViewerProvider } from '@/components/layout/viewer-chrome'
import { ViewerListingClaim } from '@/components/marketplace/listing-claim-box'

// Public housing detail, advertised in app/sitemap.ts. Auth during render is a dynamic API
// and would void ISR. Owners still edit at /housing/[id]/edit. The save heart and a ?claim=
// arrival hydrate from /api/viewer.
export const revalidate = 3600

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const listing = await getListingWithOwner(id)
  if (!listing || listing.vertical !== 'housing') {
    return { title: 'Listing not found', robots: { index: false, follow: false } }
  }
  const detail = await getHousingDetail(id)
  return listingMetadata(listingDetailFromHousing(listing, detail, { isOwner: false }))
}

const ROOM_LABEL: Record<string, string> = {
  private_room: 'Private room',
  shared_room: 'Shared room',
  entire_place: 'Entire place',
}

function money(cents: number | null): string | null {
  if (cents == null) return null
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function leaseLabel(months: number | null): string | null {
  if (months == null) return null
  if (months === 0) return 'Month to month'
  return `${months} month lease`
}

function longDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default async function HousingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const listing = await getListingWithOwner(id)
  if (!listing || listing.vertical !== 'housing' || listing.status !== 'active') notFound()

  const [detail, comments] = await Promise.all([
    getHousingDetail(id),
    getListingComments('listing', id),
  ])

  // The housing-only structured facts for the Accommodation JSON-LD (rooms, size, pets,
  // amenities, per-month rent). Coarse-location posture unchanged: never a street address.
  const housingFacts: HousingSeoFacts | undefined = detail
    ? {
        bedrooms: detail.bedrooms,
        bathrooms: detail.bathrooms,
        sqft: detail.sqft,
        petsAllowed: detail.petsOk,
        amenityLabels: detail.amenities.map(amenityLabel),
        rentCents: detail.rentCents,
      }
    : undefined

  // The public page is the listing, not the editor. Owners still edit at /housing/[id]/edit.
  const view = {
    ...listingDetailFromHousing(listing, detail, { isOwner: false }),
    housingFacts,
  }
  const firstName = listing.owner?.displayName.split(' ')[0] ?? 'the host'

  // The address, resolved through the member's chosen precision (ADR-867). The street
  // address is SERVER-checked here: it only renders when the member picked 'exact' AND
  // the viewer is signed in. It rides the page body only — the view's locationLabel
  // (meta + JSON-LD) is computed public-safe inside listingDetailFromHousing.
  const address = detail
    ? resolveAddressDisplay({
        precision: detail.addressPrecision,
        city: listing.city,
        neighborhood: listing.neighborhood,
        addressLine: detail.addressLine,
        signedIn: false,
      })
    : null

  // Structured facts, rendered as a compact spec grid when present.
  const facts: { label: string; value: string }[] = []
  if (detail?.propertyType) facts.push({ label: 'Property', value: propertyTypeLabel(detail.propertyType) ?? detail.propertyType })
  if (detail?.roomType) facts.push({ label: 'Space', value: ROOM_LABEL[detail.roomType] ?? detail.roomType })
  if (detail?.bedrooms != null) facts.push({ label: 'Bedrooms', value: String(detail.bedrooms) })
  if (detail?.bathrooms != null) facts.push({ label: 'Bathrooms', value: String(detail.bathrooms) })
  if (detail?.sqft != null) facts.push({ label: 'Size', value: `${detail.sqft.toLocaleString('en-US')} sq ft` })
  if (detail && leaseLabel(detail.leaseMonths)) facts.push({ label: 'Lease', value: leaseLabel(detail.leaseMonths)! })
  if (detail && money(detail.depositCents)) facts.push({ label: 'Deposit', value: money(detail.depositCents)! })
  if (detail && money(detail.moveInCostsCents)) facts.push({ label: 'Move-in costs', value: money(detail.moveInCostsCents)! })
  if (detail?.minStayMonths != null) facts.push({ label: 'Minimum stay', value: `${detail.minStayMonths} ${detail.minStayMonths === 1 ? 'month' : 'months'}` })
  if (detail?.maxOccupants != null) facts.push({ label: 'Max occupants', value: String(detail.maxOccupants) })
  if (detail && parkingLabel(detail.parking)) facts.push({ label: 'Parking', value: parkingLabel(detail.parking)! })
  if (detail && laundryLabel(detail.laundry)) facts.push({ label: 'Laundry', value: laundryLabel(detail.laundry)! })
  if (detail?.householdSize != null) facts.push({ label: 'In the home', value: `${detail.householdSize} ${detail.householdSize === 1 ? 'person' : 'people'}` })
  if (detail && longDate(detail.availableFrom)) facts.push({ label: 'Available', value: longDate(detail.availableFrom)! })
  if (address?.addressLine) facts.push({ label: 'Address', value: address.addressLine })

  // House rules as plain yes-tags (only the ones that are true or explicitly set).
  const rules: string[] = []
  if (detail?.furnished) rules.push('Furnished')
  if (detail?.utilitiesIncluded) rules.push('Utilities included')
  if (detail?.petsOk) rules.push('Pets welcome')
  if (detail?.smokingOk) rules.push('Smoking OK')
  if (detail?.cannabisOk) rules.push('Cannabis friendly')
  if (detail?.bathroomsShared) rules.push('Shared bathroom')

  return (
    <ViewerProvider>
    <Suspense fallback={null}>
      <ViewerListingClaim detailPath={`/housing/${id}`} />
    </Suspense>
    <ListingDetailTemplate
      view={view}
      comments={comments}
      canComment={false}
      canModerate={false}
      myProfileId={null}
      contactNote={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-meta text-subtle">
              No payment happens in the app. Message {firstName} to arrange a viewing and the rest offline.
            </p>
            <div className="flex items-center gap-3">
              <SaveListingButton
                listingId={listing.id}
                initialSaved={false}
                signedIn={false}
                signInNext={`/housing/${listing.id}`}
              />
              <ReportButton targetKind="listing" targetId={listing.id} />
            </div>
          </div>
      }
    >
      {facts.length > 0 && (
        <dl className="mb-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="text-2xs font-semibold uppercase tracking-wide text-muted">{f.label}</dt>
              <dd className="mt-0.5 text-body-sm font-medium text-text">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {detail && detail.amenities.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted">Amenities</p>
          <ul className="flex flex-wrap gap-2">
            {detail.amenities.map((a) => (
              <li key={a} className="rounded-pill bg-surface-elevated px-2.5 py-0.5 text-meta font-medium text-text">
                {amenityLabel(a)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail && detail.accessibility.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted">Accessibility</p>
          <ul className="flex flex-wrap gap-2">
            {detail.accessibility.map((t) => (
              <li key={t} className="rounded-pill bg-surface-elevated px-2.5 py-0.5 text-meta font-medium text-text">
                {accessibilityLabel(t)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rules.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted">Good to know</p>
          <ul className="flex flex-wrap gap-2">
            {rules.map((r) => (
              <li key={r} className="rounded-pill bg-primary-bg px-2.5 py-0.5 text-meta font-medium text-primary-strong">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </ListingDetailTemplate>
    </ViewerProvider>
  )
}
