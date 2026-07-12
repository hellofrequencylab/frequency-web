// Standardized marketplace listing detail template (PAGE-FRAMEWORK — composes DetailTemplate).
// Classifieds, Market, and Housing all render THIS: a hero-ad-format cover (ListingHero) over a
// plain info line (price/terms . location . relative time), then the description + photo gallery,
// then any vertical-specific extras (passed as children), the seller/contact row, and the Q&A feed.
//
// Server Component: it takes the resolved ListingDetailView + the comment data and stitches the
// pieces. The only client islands are the gallery lightbox (EventGallery) and the Q&A composer
// (ListingQna); everything else renders on the server.

import Link from 'next/link'
import { CalendarDays, MapPin, MessageCircle, Pencil } from 'lucide-react'
import { DetailTemplate } from '@/components/templates/detail-template'
import { EventGallery } from '@/components/events/event-gallery'
import { ListingHero } from '@/components/marketplace/listing-hero'
import { ListingQna } from '@/components/marketplace/listing-qna'
import type { ListingDetailView } from '@/lib/listings-shared/detail-view'
import type { ListingComment } from '@/lib/marketplace/listing-comments'
import { relativeTime } from '@/lib/utils'

/** The plain info line that sits immediately under the hero: price/terms . location . relative time. */
function ListingInfoLine({ view }: { view: ListingDetailView }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
      {view.priceLabel && <span className="font-semibold text-text">{view.priceLabel}</span>}
      {view.terms && <span>{view.terms}</span>}
      {view.locationLabel && (
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5 text-subtle" aria-hidden />
          {view.locationLabel}
        </span>
      )}
      <span className="inline-flex items-center gap-1">
        <CalendarDays className="h-3.5 w-3.5 text-subtle" aria-hidden />
        {relativeTime(view.createdAt)}
      </span>
      {view.status && (
        <span className="inline-flex items-center rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted">
          {view.status}
        </span>
      )}
    </div>
  )
}

export function ListingDetailTemplate({
  view,
  comments,
  canComment,
  canModerate,
  myProfileId,
  children,
  footer,
  contactNote,
  ownerControls,
}: {
  view: ListingDetailView
  comments: ListingComment[]
  /** Viewer is signed in (may add a Q&A comment). */
  canComment: boolean
  /** Viewer may delete any comment (listing owner or staff). */
  canModerate: boolean
  myProfileId: string | null
  /** Lead extras rendered inside the body card, BEFORE the description (housing facts/amenities,
   *  market service terms). */
  children?: React.ReactNode
  /** Extras rendered BELOW the body card (market purchase block + reviews). */
  footer?: React.ReactNode
  /** The small offline-payment / report line under the body. */
  contactNote?: React.ReactNode
  /** Owner-only status controls (close/reopen/delete). */
  ownerControls?: React.ReactNode
}) {
  const hasAction = !!view.action && view.action.kind !== 'none'
  const ActionIcon = view.action?.kind === 'edit' ? Pencil : MessageCircle
  // The route to refresh after a Q&A write (each vertical mounts at a different path).
  const detailPath =
    view.vertical === 'classifieds'
      ? `/classifieds/${view.id}`
      : view.vertical === 'market'
        ? `/market/${view.id}`
        : `/marketplace/housing/${view.id}`

  return (
    <div className="mx-auto w-full max-w-2xl">
      <DetailTemplate
        back={view.back}
        hero={
          <ListingHero
            title={view.title}
            image={view.primaryImage}
            categoryLabel={view.categoryLabel}
            priceLabel={view.priceLabel}
            action={view.action}
          />
        }
        // `band` REPLACES the default title lockup so the title isn't repeated below the hero (it is
        // the hero's overlaid h1). The band carries the plain info line instead.
        band={<ListingInfoLine view={view} />}
        title={view.title}
      >
        {/* Photo gallery: image[0] is the hero above, so the strip shows the rest (self-hides if none). */}
        {view.galleryImages.length > 0 && <EventGallery images={view.galleryImages} />}

        <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
          {/* Vertical extras first (housing facts/amenities, market service terms) so they sit with
              the description; market's Buy/variants/reviews also arrive here. */}
          {children}

          {view.description && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">{view.description}</p>
          )}

          {/* Seller credit + the primary action, repeated inline under the body (the hero CTA is the
              lead; this is the "Posted by" handoff the old pages carried). */}
          {view.seller && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <Link href={`/people/${view.seller.handle}`} className="text-sm text-muted hover:text-text">
                {view.isOwner ? 'Your listing' : 'Posted by'}{' '}
                <span className="font-semibold text-text">{view.seller.displayName}</span>
              </Link>
              {hasAction && (
                <Link
                  href={view.action!.href}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
                >
                  <ActionIcon className="h-4 w-4" aria-hidden />
                  {view.action!.label}
                </Link>
              )}
            </div>
          )}
        </div>

        {footer}

        {contactNote && <div className="mt-3 px-1">{contactNote}</div>}
        {ownerControls && <div className="mt-4">{ownerControls}</div>}

        <ListingQna
          targetKind={view.commentTargetKind}
          targetId={view.id}
          revalidatePath={detailPath}
          comments={comments}
          canPost={canComment}
          canModerate={canModerate}
          myProfileId={myProfileId}
          isOwner={view.isOwner}
        />
      </DetailTemplate>
    </div>
  )
}
