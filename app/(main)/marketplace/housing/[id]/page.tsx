import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapPin, MessageCircle, CalendarDays, Home, BedDouble } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getListingWithOwner } from '@/lib/listings'
import { getHousingDetail } from '@/lib/listings/housing'
import { relativeTime } from '@/lib/utils'
import { DetailTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { ReportButton } from '@/components/marketplace/report-button'
import { setListingStatusAction, deleteListingAction } from '../../actions'

export const dynamic = 'force-dynamic'

const TYPE_LABEL: Record<string, string> = { rental: 'Rental', roommate: 'Roommate', sublet: 'Sublet' }
const ROOM_LABEL: Record<string, string> = {
  private_room: 'Private room',
  shared_room: 'Shared room',
  entire_place: 'Entire place',
}

function rent(cents: number | null): string | null {
  if (cents == null) return null
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo`
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
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
          {listing.images.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {listing.images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt={`${listing.title}, photo ${i + 1}`}
                  className="aspect-square w-full rounded-xl border border-border object-cover"
                />
              ))}
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
