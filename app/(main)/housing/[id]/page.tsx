import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getMyProfileId, isPlatformStaff } from '@/lib/auth'
import { getListingWithOwner, getListingClaimToken, listSavedListingIds } from '@/lib/listings'
import {
  accessibilityLabel,
  amenityLabel,
  getHousingDetail,
  laundryLabel,
  parkingLabel,
  propertyTypeLabel,
  resolveAddressDisplay,
} from '@/lib/listings/housing'
import { resolveListingClaim } from '@/lib/listing-seeder/claim'
import { buttonClasses } from '@/components/ui/button'
import { ReportButton } from '@/components/marketplace/report-button'
import { SaveListingButton } from '@/components/marketplace/save-listing-button'
import { ListingClaimLink } from '@/components/marketplace/listing-claim-link'
import { ListingDetailTemplate } from '@/components/templates/listing-detail-template'
import { listingDetailFromHousing } from '@/lib/listings-shared/detail-view'
import { listingMetadata, type HousingSeoFacts } from '@/lib/listings-shared/listing-seo'
import { getListingComments } from '@/lib/marketplace/listing-comments'
import { setListingStatusAction, deleteListingAction } from '@/app/(main)/marketplace/actions'

export const dynamic = 'force-dynamic'

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
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ claim?: string; claimed?: string }>
}) {
  const { id } = await params
  const { claim: claimParam } = await searchParams
  const [profileId, isStaff, listing] = await Promise.all([
    getMyProfileId(),
    isPlatformStaff(),
    getListingWithOwner(id),
  ])
  if (!listing || listing.vertical !== 'housing') notFound()

  const isOwner = !!profileId && listing.ownerProfileId === profileId
  if (!isOwner && !isStaff && listing.status !== 'active') notFound()

  // Claim link: a visitor arriving with ?claim=<token> that resolves to THIS still-unclaimed listing
  // sees a "Claim listing" box instead of Contact the host. resolveListingClaim returns null for a
  // used/unknown token or an already-claimed row, so the token self-validates and reveals nothing.
  // (Mirrors app/(main)/classifieds/[id]/page.tsx; the claim spine already covers the housing vertical.)
  let claimToken: string | null = null
  if (claimParam) {
    const resolved = await resolveListingClaim(claimParam)
    if (resolved && resolved.listingId === id) claimToken = claimParam
  }

  // Operator (admin/janitor) shortcut: for a SEEDED, still-unclaimed housing listing, surface the
  // shareable claim link in the Manage box so they can send it to the real host. getListingClaimToken
  // returns null once claimed or for a member-created row, so this disappears exactly when it should.
  let claimShareUrl: string | undefined
  if (isStaff && listing.seededUnclaimed) {
    const token = await getListingClaimToken(id)
    if (token) claimShareUrl = `/housing/${id}?claim=${token}`
  }

  const [detail, comments, savedIds] = await Promise.all([
    getHousingDetail(id),
    getListingComments('listing', id),
    profileId ? listSavedListingIds(profileId, [id]) : Promise.resolve(new Set<string>()),
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

  // Owners get the Edit action (hero overlay + Manage rail link, both rendered by the
  // shared template off `action.kind === 'edit'`), pointing at the [id]/edit route.
  const view = {
    ...listingDetailFromHousing(listing, detail, { isOwner }),
    ...(isOwner
      ? { action: { kind: 'edit' as const, label: 'Edit listing', href: `/housing/${id}/edit` } }
      : {}),
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
        signedIn: !!profileId,
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
    <ListingDetailTemplate
      view={view}
      comments={comments}
      canComment={!!profileId}
      canModerate={isOwner || isStaff}
      myProfileId={profileId}
      contactNote={
        !isOwner ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-subtle">
              No payment happens in the app. Message {firstName} to arrange a viewing and the rest offline.
            </p>
            <div className="flex items-center gap-3">
              <SaveListingButton
                listingId={listing.id}
                initialSaved={savedIds.has(listing.id)}
                signedIn={!!profileId}
                signInNext={`/housing/${listing.id}`}
              />
              <ReportButton targetKind="listing" targetId={listing.id} />
            </div>
          </div>
        ) : undefined
      }
      claimToken={claimToken}
      ownerControls={
        isOwner || claimShareUrl ? (
          <div className="space-y-3">
            {isOwner && (
              <div className="flex flex-wrap gap-2">
                {listing.status === 'active' ? (
                  <form action={setListingStatusAction.bind(null, listing.id, 'closed')}>
                    <button type="submit" className={buttonClasses('ghost', 'sm')}>
                      Close listing
                    </button>
                  </form>
                ) : (
                  <form action={setListingStatusAction.bind(null, listing.id, 'active')}>
                    <button type="submit" className={buttonClasses('ghost', 'sm')}>
                      Reopen listing
                    </button>
                  </form>
                )}
                <form action={deleteListingAction.bind(null, listing.id)}>
                  <button type="submit" className={buttonClasses('ghost', 'sm')}>
                    Delete
                  </button>
                </form>
              </div>
            )}
            {/* Platform staff on a seeded, unclaimed listing: the shareable claim link to send the host. */}
            {claimShareUrl && <ListingClaimLink claimShareUrl={claimShareUrl} />}
          </div>
        ) : undefined
      }
    >
      {facts.length > 0 && (
        <dl className="mb-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="text-2xs font-semibold uppercase tracking-wide text-muted">{f.label}</dt>
              <dd className="mt-0.5 text-sm font-medium text-text">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {detail && detail.amenities.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted">Amenities</p>
          <ul className="flex flex-wrap gap-2">
            {detail.amenities.map((a) => (
              <li key={a} className="rounded-full bg-surface-elevated px-2.5 py-0.5 text-xs font-medium text-text">
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
              <li key={t} className="rounded-full bg-surface-elevated px-2.5 py-0.5 text-xs font-medium text-text">
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
              <li key={r} className="rounded-full bg-primary-bg px-2.5 py-0.5 text-xs font-medium text-primary-strong">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </ListingDetailTemplate>
  )
}
