import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapPin, MessageCircle, CalendarDays, Pencil } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getListing, LISTING_KINDS, type ListingKind } from '@/lib/marketplace'
import { relativeTime } from '@/lib/utils'
import { ListingOwnerControls } from '@/components/market/listing-owner-controls'
import { DetailTemplate } from '@/components/templates'

export const dynamic = 'force-dynamic'

const KIND_LABEL: Record<ListingKind, string> = Object.fromEntries(LISTING_KINDS.map((k) => [k.key, k.label])) as Record<ListingKind, string>

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [profileId, listing] = await Promise.all([getMyProfileId(), getListing(id)])
  if (!listing) notFound()

  const isOwner = !!profileId && listing.author_id === profileId
  // Non-active listings are visible only to their author.
  if (!isOwner && listing.status !== 'active') notFound()

  const place = [listing.neighborhood, listing.city].filter(Boolean).join(', ')

  return (
    <div className="mx-auto w-full max-w-2xl">
      <DetailTemplate
        title={listing.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {listing.price_note && <span className="font-semibold text-text">{listing.price_note}</span>}
            {place && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{place}</span>}
            <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{relativeTime(listing.created_at)}</span>
          </span>
        }
        badges={
          <span className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-primary-bg px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-primary-strong">
              {KIND_LABEL[listing.kind] ?? listing.kind}
            </span>
            {listing.category && <span className="text-xs text-subtle">{listing.category}</span>}
            {listing.status !== 'active' && (
              <span className="inline-flex items-center rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted">{listing.status}</span>
            )}
          </span>
        }
      >
      <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
        {/* Images */}
        {listing.images.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {listing.images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt={`${listing.title}, photo ${i + 1}`} className="aspect-square w-full rounded-xl border border-border object-cover" />
            ))}
          </div>
        )}

        {listing.description && (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-text">{listing.description}</p>
        )}

        {/* Seller + contact */}
        {listing.author && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <Link href={`/people/${listing.author.handle}`} className="text-sm text-muted hover:text-text">
              Posted by <span className="font-semibold text-text">{listing.author.display_name}</span>
            </Link>
            {isOwner ? (
              <Link
                href={`/market/${listing.id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
              >
                <Pencil className="h-4 w-4" /> Edit listing
              </Link>
            ) : (
              <Link
                href={`/people/${listing.author.handle}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                <MessageCircle className="h-4 w-4" /> Contact {listing.author.display_name.split(' ')[0]}
              </Link>
            )}
          </div>
        )}
      </div>

      {!isOwner && (
        <p className="mt-3 px-1 text-xs text-subtle">No payment happens in the app. Message {listing.author?.display_name.split(' ')[0] ?? 'the poster'} to arrange it offline.</p>
      )}

      {isOwner && (
        <div className="mt-4">
          <ListingOwnerControls id={listing.id} status={listing.status} />
        </div>
      )}
      </DetailTemplate>
    </div>
  )
}
