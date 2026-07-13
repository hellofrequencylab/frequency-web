import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getMyProfileId, isPlatformStaff } from '@/lib/auth'
import { getListingWithOwner, getListingClaimToken } from '@/lib/listings'
import { amenityLabel, getHousingDetail, propertyTypeLabel } from '@/lib/listings/housing'
import { resolveListingClaim } from '@/lib/listing-seeder/claim'
import { buttonClasses } from '@/components/ui/button'
import { ReportButton } from '@/components/marketplace/report-button'
import { ListingClaimLink } from '@/components/marketplace/listing-claim-link'
import { ListingDetailTemplate } from '@/components/templates/listing-detail-template'
import { listingDetailFromHousing } from '@/lib/listings-shared/detail-view'
import { listingMetadata } from '@/lib/listings-shared/listing-seo'
import { getListingComments } from '@/lib/marketplace/listing-comments'
import { setListingStatusAction, deleteListingAction } from '../../actions'

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
    if (token) claimShareUrl = `/marketplace/housing/${id}?claim=${token}`
  }

  const [detail, comments] = await Promise.all([getHousingDetail(id), getListingComments('listing', id)])
  const view = listingDetailFromHousing(listing, detail, { isOwner })
  const firstName = listing.owner?.displayName.split(' ')[0] ?? 'the host'

  // Structured facts, rendered as a compact spec grid when present.
  const facts: { label: string; value: string }[] = []
  if (detail?.propertyType) facts.push({ label: 'Property', value: propertyTypeLabel(detail.propertyType) ?? detail.propertyType })
  if (detail?.roomType) facts.push({ label: 'Space', value: ROOM_LABEL[detail.roomType] ?? detail.roomType })
  if (detail?.bedrooms != null) facts.push({ label: 'Bedrooms', value: String(detail.bedrooms) })
  if (detail?.bathrooms != null) facts.push({ label: 'Bathrooms', value: String(detail.bathrooms) })
  if (detail?.sqft != null) facts.push({ label: 'Size', value: `${detail.sqft.toLocaleString('en-US')} sq ft` })
  if (detail && leaseLabel(detail.leaseMonths)) facts.push({ label: 'Lease', value: leaseLabel(detail.leaseMonths)! })
  if (detail && money(detail.depositCents)) facts.push({ label: 'Deposit', value: money(detail.depositCents)! })
  if (detail?.householdSize != null) facts.push({ label: 'In the home', value: `${detail.householdSize} ${detail.householdSize === 1 ? 'person' : 'people'}` })
  if (detail && longDate(detail.availableFrom)) facts.push({ label: 'Available', value: longDate(detail.availableFrom)! })

  // House rules as plain yes-tags (only the ones that are true or explicitly set).
  const rules: string[] = []
  if (detail?.furnished) rules.push('Furnished')
  if (detail?.utilitiesIncluded) rules.push('Utilities included')
  if (detail?.petsOk) rules.push('Pets welcome')
  if (detail?.smokingOk) rules.push('Smoking OK')
  if (detail?.cannabisOk) rules.push('Cannabis friendly')

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
            <ReportButton targetKind="listing" targetId={listing.id} />
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
              <dt className="text-2xs font-semibold uppercase tracking-wide text-subtle">{f.label}</dt>
              <dd className="mt-0.5 text-sm font-medium text-text">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {detail && detail.amenities.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Amenities</p>
          <ul className="flex flex-wrap gap-2">
            {detail.amenities.map((a) => (
              <li key={a} className="rounded-full bg-surface-elevated px-2.5 py-0.5 text-xs font-medium text-text">
                {amenityLabel(a)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rules.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Good to know</p>
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
