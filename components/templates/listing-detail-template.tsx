// Standardized marketplace listing detail page (Classifieds, Market, Housing all render THIS).
//
// Layout mirrors the Events detail page: FULL WIDTH inside the content column (the global community
// rail stays beside it — page-chrome keeps the rail; we never suppress it, PAGE-FRAMEWORK). Top to
// bottom: a hero-ad cover (short price top-left, category top-right, title + owner Edit overlaid), a
// larger info line + "Posted by" link + a QR/Link share, then the HEADER (gallery + description) full
// width, then a two-column body: MAIN (the Q&A feed + a pickup-area map) and a RIGHT rail (Contact
// dialog, Item details, Manage your listing), and finally a full-width marketing CTA.
//
// Server Component: it stitches the resolved ListingDetailView + comment data. The client islands are
// the gallery lightbox (EventGallery), the Q&A composer (ListingQna), the Contact dialog, the QR/Link
// share, and the maplibre pickup map; everything else renders on the server.

import Link from 'next/link'
import { CalendarDays, MapPin, Pencil } from 'lucide-react'
import { EventGallery } from '@/components/events/event-gallery'
import { JsonLd } from '@/components/json-ld'
import { ListingHero } from '@/components/marketplace/listing-hero'
import { ListingQna } from '@/components/marketplace/listing-qna'
import { ListingShareButton } from '@/components/marketplace/listing-share-button'
import { ListingDetailsCard } from '@/components/marketplace/listing-details-card'
import { ListingMarketingCTA } from '@/components/marketplace/listing-marketing-cta'
import { ListingLocationMap } from '@/components/marketplace/listing-location-map'
import { ListingContactDialog } from '@/components/marketplace/listing-contact-dialog'
import { ListingClaimBox } from '@/components/marketplace/listing-claim-box'
import type { ListingDetailView } from '@/lib/listings-shared/detail-view'
import { listingCanonicalPath } from '@/lib/listings-shared/listing-seo'
import { listingJsonLd } from '@/lib/listings-shared/listing-seo'
import type { ListingComment } from '@/lib/marketplace/listing-comments'
import type { OfferTargetKind } from '@/lib/marketplace/listing-offers'
import { relativeTime } from '@/lib/utils'

/** The larger info line directly under the hero: price/terms . location . relative time. */
function ListingInfoLine({ view }: { view: ListingDetailView }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-muted">
      {view.priceLabel && <span className="font-semibold text-text">{view.priceLabel}</span>}
      {view.terms && <span>{view.terms}</span>}
      {view.locationLabel && (
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-4 w-4 text-subtle" aria-hidden />
          {view.locationLabel}
        </span>
      )}
      <span className="inline-flex items-center gap-1">
        <CalendarDays className="h-4 w-4 text-subtle" aria-hidden />
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
  claimToken,
}: {
  view: ListingDetailView
  comments: ListingComment[]
  /** Viewer is signed in (may add a Q&A comment / contact the seller). */
  canComment: boolean
  /** Viewer may delete any comment (listing owner or staff). */
  canModerate: boolean
  myProfileId: string | null
  /** Lead extras rendered inside the description card, BEFORE the description (housing facts/amenities,
   *  market service terms). */
  children?: React.ReactNode
  /** Extras rendered BELOW the description card (market purchase block + reviews). */
  footer?: React.ReactNode
  /** The small offline-payment / report line, shown inside the Contact module. */
  contactNote?: React.ReactNode
  /** Owner-only status controls (close/reopen/delete), shown in the Manage module. */
  ownerControls?: React.ReactNode
  /** A valid claim token (the visitor arrived via /classifieds/<id>?claim=<token> on a seeded,
   *  unclaimed listing). When set, a "Claim listing" box REPLACES the Contact module. */
  claimToken?: string | null
}) {
  const detailPath = listingCanonicalPath(view)
  const editHref = view.action?.kind === 'edit' ? view.action.href : null
  const sellerFirst = view.seller?.displayName.split(/\s+/)[0] || 'the seller'
  // The top gallery shows EVERY photo with the main image first, so a single-photo listing still gets
  // a gallery row (owner directive), not just the hero.
  const galleryAll = view.primaryImage ? [view.primaryImage, ...view.galleryImages] : view.galleryImages
  // A non-owner with a resolvable seller may open the Contact dialog (message + optional offer).
  const showContact = !view.isOwner && !!view.sellerProfileId
  const jsonLd = listingJsonLd(view)

  return (
    <div className="w-full pb-4">
      {jsonLd.length > 0 && <JsonLd data={jsonLd} />}

      {/* HERO — price top-left, category top-right, title + owner Edit overlaid on the bottom.
          (The breadcrumb is rendered once by the page chrome above this; we don't repeat it here.) */}
      <ListingHero
        title={view.title}
        image={view.primaryImage}
        categoryLabel={view.categoryLabel}
        priceShort={view.priceShort}
        actionSlot={
          view.isOwner && editHref ? (
            <Link
              href={editHref}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-white/90"
            >
              <Pencil className="h-4 w-4" aria-hidden /> Edit listing
            </Link>
          ) : undefined
        }
      />

      {/* Info band: larger price/terms/location/time line + Posted-by, with the QR/Link share opposite. */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <ListingInfoLine view={view} />
          {view.seller && (
            <Link href={`/people/${view.seller.handle}`} className="inline-block text-sm text-muted hover:text-text">
              {view.isOwner ? 'Your listing' : 'Posted by'}{' '}
              <span className="font-semibold text-text">{view.seller.displayName}</span>
            </Link>
          )}
        </div>
        <ListingShareButton path={detailPath} title={view.title} sharerProfileId={myProfileId} />
      </div>

      <hr className="my-6 border-border" />

      {/* HEADER — the gallery, full width (it sits where the description used to). Shows every photo
          with the main image first, so a listing with a single photo still gets a gallery row. */}
      {galleryAll.length > 0 && (
        <div className="mb-6">
          <EventGallery images={galleryAll} />
        </div>
      )}

      {/* BODY — MAIN (description + Q&A + map) beside the RIGHT rail (contact, details, manage). */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {/* Description, moved above the Questions feed. Vertical extras (housing facts, market buy)
              lead inside the same card; the market purchase panel (footer) follows it. */}
          <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
            {children}
            {view.description && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">{view.description}</p>
            )}
          </div>

          {footer}

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

          {view.pickup && (
            <section className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="mb-3 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> {view.pickup.precise ? 'Pickup location' : 'Pickup area'}
              </h2>
              <ListingLocationMap
                lat={view.pickup.lat}
                lng={view.pickup.lng}
                areaLabel={view.pickup.areaLabel}
                precise={view.pickup.precise}
                exactAddress={view.pickup.exactAddress}
              />
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {claimToken ? (
            /* Arrived via a claim link: the Claim box REPLACES Contact the seller. */
            <section className="rounded-2xl border border-primary/40 bg-primary-bg/40 p-4">
              <h2 className="mb-3 text-2xs font-semibold uppercase tracking-wide text-primary-strong">Claim this listing</h2>
              <ListingClaimBox
                token={claimToken}
                signedIn={!!myProfileId}
                signInHref={`/sign-in?next=${encodeURIComponent(`${detailPath}?claim=${claimToken}`)}`}
              />
            </section>
          ) : showContact ? (
            <section className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="mb-3 text-2xs font-semibold uppercase tracking-wide text-subtle">Contact the seller</h2>
              <ListingContactDialog
                // A ListingDetailView is always a marketplace listing (never a Recording), so its
                // comment kind is always an offer target; narrow the wider comment union here.
                targetKind={view.commentTargetKind as OfferTargetKind}
                targetId={view.id}
                sellerName={sellerFirst}
                triggerLabel={`Contact ${sellerFirst}`}
                viewerSignedIn={!!myProfileId}
                canOffer={!!myProfileId}
                highestOfferCents={view.highestOfferCents}
                revalidatePath={detailPath}
                triggerClassName="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              />
              {contactNote && <div className="mt-3">{contactNote}</div>}
            </section>
          ) : null}

          <ListingDetailsCard details={view.details} />

          {ownerControls && (
            <div className="space-y-2">
              {editHref && (
                <Link
                  href={editHref}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
                >
                  <Pencil className="h-4 w-4" aria-hidden /> Edit listing
                </Link>
              )}
              {ownerControls}
            </div>
          )}
        </aside>
      </div>

      {/* Full-width marketing CTA. */}
      <ListingMarketingCTA vertical={view.vertical} />
    </div>
  )
}
