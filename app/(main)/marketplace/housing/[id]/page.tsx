import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapPin, MessageCircle, CalendarDays, Home, BedDouble } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getListingWithOwner } from '@/lib/listings'
import { amenityLabel, getHousingDetail, propertyTypeLabel } from '@/lib/listings/housing'
import { createAdminClient } from '@/lib/supabase/admin'
import { relativeTime } from '@/lib/utils'
import { DetailTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { EventGallery } from '@/components/events/event-gallery'
import { ReportButton } from '@/components/marketplace/report-button'
import { setListingStatusAction, deleteListingAction } from '../../actions'

export const dynamic = 'force-dynamic'

const TYPE_LABEL: Record<string, string> = {
  rental: 'Rental',
  roommate: 'Roommate',
  sublet: 'Sublet',
  roommate_wanted: 'Roommate wanted',
  housing_wanted: 'Housing wanted',
}
const ROOM_LABEL: Record<string, string> = {
  private_room: 'Private room',
  shared_room: 'Shared room',
  entire_place: 'Entire place',
}

function rent(cents: number | null): string | null {
  if (cents == null) return null
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo`
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

/** Resolve a stored gallery entry to a public URL. New listings store event-media
 *  bucket PATHS (via MultiImageUpload); anything already absolute is passed through. */
function resolveImage(admin: ReturnType<typeof createAdminClient>, entry: string): string {
  if (/^https?:\/\//.test(entry)) return entry
  return admin.storage.from('event-media').getPublicUrl(entry).data.publicUrl
}

export default async function HousingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [profileId, listing] = await Promise.all([getMyProfileId(), getListingWithOwner(id)])
  if (!listing || listing.vertical !== 'housing') notFound()

  const isOwner = !!profileId && listing.ownerProfileId === profileId
  if (!isOwner && listing.status !== 'active') notFound()

  const detail = await getHousingDetail(id)
  const place = [listing.neighborhood, listing.city].filter(Boolean).join(', ')
  const firstName = listing.owner?.displayName.split(' ')[0] ?? 'the host'

  const admin = createAdminClient()
  const imageUrls = listing.images.map((entry) => resolveImage(admin, entry))

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
    <div className="mx-auto w-full max-w-2xl">
      <DetailTemplate
        back={{ href: '/marketplace/housing', label: 'Housing' }}
        title={listing.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {detail && rent(detail.rentCents) && (
              <span className="font-semibold text-text">{rent(detail.rentCents)}</span>
            )}
            {place && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {place}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {relativeTime(listing.createdAt)}
            </span>
          </span>
        }
        badges={
          <span className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-bg px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-primary-strong">
              <Home className="h-3 w-3" />
              {detail ? TYPE_LABEL[detail.listingType] ?? detail.listingType : 'Housing'}
            </span>
            {detail?.roomType && (
              <span className="inline-flex items-center gap-1 text-xs text-subtle">
                <BedDouble className="h-3 w-3" />
                {ROOM_LABEL[detail.roomType] ?? detail.roomType}
              </span>
            )}
            {detail?.bedrooms != null && <span className="text-xs text-subtle">{detail.bedrooms} bed</span>}
            {listing.status !== 'active' && (
              <span className="inline-flex items-center rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted">
                {listing.status}
              </span>
            )}
          </span>
        }
      >
        {imageUrls.length > 0 && (
          <div className="mb-4 overflow-hidden rounded-3xl border border-border bg-surface-elevated">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrls[0]}
              alt={`${listing.title}, cover photo`}
              className="max-h-[28rem] w-full object-cover"
            />
          </div>
        )}
        {imageUrls.length > 1 && <EventGallery images={imageUrls.slice(1)} />}

        <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
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
                  <li
                    key={a}
                    className="rounded-full bg-surface-elevated px-2.5 py-0.5 text-xs font-medium text-text"
                  >
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

          {listing.description && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">{listing.description}</p>
          )}

          {listing.owner && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <Link href={`/people/${listing.owner.handle}`} className="text-sm text-muted hover:text-text">
                Listed by <span className="font-semibold text-text">{listing.owner.displayName}</span>
              </Link>
              {!isOwner && (
                <Link href={`/people/${listing.owner.handle}`} className={buttonClasses('primary', 'md')}>
                  <MessageCircle className="h-4 w-4" /> Message {firstName}
                </Link>
              )}
            </div>
          )}
        </div>

        {!isOwner && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-xs text-subtle">
              No payment happens in the app. Message {firstName} to arrange a viewing and the rest offline.
            </p>
            <ReportButton targetKind="listing" targetId={listing.id} />
          </div>
        )}

        {isOwner && (
          <div className="mt-4 flex flex-wrap gap-2">
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
      </DetailTemplate>
    </div>
  )
}
