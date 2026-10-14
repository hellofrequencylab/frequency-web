import Link from 'next/link'
import '@/app/themes/active/members-b'
import { EventGallery } from '@/components/events/event-gallery'
import { JsonLd } from '@/components/json-ld'
import { ListingQna } from '@/components/marketplace/listing-qna'
import { ListingShareButton } from '@/components/marketplace/listing-share-button'
import { LISTING_CTA_COPY } from '@/components/marketplace/listing-marketing-cta'
import { ListingLocationMap } from '@/components/marketplace/listing-location-map'
import { ListingContactDialog } from '@/components/marketplace/listing-contact-dialog'
import { ListingClaimBox } from '@/components/marketplace/listing-claim-box'
import { MembersBody } from '@/components/frequency/members/shared/members-body'
import { FqAvatar } from '@/components/frequency/members/shared/avatar'
import { FqIcon } from '@/components/frequency/icon'
import type { ListingDetailView } from '@/lib/listings-shared/detail-view'
import { listingCanonicalPath, listingJsonLd } from '@/lib/listings-shared/listing-seo'
import type { ListingComment } from '@/lib/marketplace/listing-comments'
import type { OfferTargetKind } from '@/lib/marketplace/listing-offers'
import { relativeTime } from '@/lib/utils'

// A MARKETPLACE LISTING, IN THE KIT. The reference has no listing page of its own, so this one is
// built from the closest one it has, Event.html: the split hero card (photo pane, then the kicker,
// title, money line, place and time, who posted it and the one primary action), then About and the
// rest down the main column and the facts down the side. ListingDetailTemplate renders it under the
// Frequency design for Classifieds, the Market and Housing alike, from the SAME resolved view and
// the same islands (the Contact dialog with its offer, the claim box, Q&A, the share QR, the pickup
// map, the gallery lightbox), so a card in the kit never opens into a DAWN page. The JSON-LD stays.

export function FqListingDetail({
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
  soloGalleryRow = true,
  asideExtras,
}: {
  view: ListingDetailView
  comments: ListingComment[]
  canComment: boolean
  canModerate: boolean
  myProfileId: string | null
  children?: React.ReactNode
  footer?: React.ReactNode
  contactNote?: React.ReactNode
  ownerControls?: React.ReactNode
  claimToken?: string | null
  soloGalleryRow?: boolean
  asideExtras?: React.ReactNode
}) {
  const detailPath = listingCanonicalPath(view)
  const editHref = view.action?.kind === 'edit' ? view.action.href : null
  const sellerFirst = view.seller?.displayName.split(/\s+/)[0] || 'the seller'
  const gallery =
    view.primaryImage && (soloGalleryRow || view.galleryImages.length > 0) ? [view.primaryImage, ...view.galleryImages] : view.galleryImages
  const showContact = !view.isOwner && !!view.sellerProfileId
  const jsonLd = listingJsonLd(view)
  const cta = LISTING_CTA_COPY[view.vertical]
  const place = [view.locationLabel, relativeTime(view.createdAt)].filter(Boolean).join(' · ')

  return (
    <MembersBody>
      {jsonLd.length > 0 && <JsonLd data={jsonLd} />}
      <Link className="meta fqm-back" href={view.back.href}>
        ← {view.back.label}
      </Link>

      <section className="card fqm-ev">
        <div className="ph fqm-ev-ph" style={view.primaryImage ? { backgroundImage: `url('${view.primaryImage}')` } : undefined}>
          {view.categoryLabel && <span className="tag glass">{view.categoryLabel}</span>}
        </div>
        <div className="fqm-ev-in">
          <span className="k">{view.vertical === 'classifieds' ? 'Classifieds' : view.vertical === 'housing' ? 'Housing' : 'Market'}</span>
          <h1 className="h1">{view.title}</h1>
          {(view.priceLabel || view.terms) && (
            <span className="h3">{[view.priceLabel, view.terms].filter(Boolean).join(' · ')}</span>
          )}
          {place && <span className="body">{place}</span>}
          {view.status && <span className="tag fqm-tag-start">{view.status}</span>}
          {view.seller && (
            <Link className="row" href={`/people/${view.seller.handle}`}>
              <FqAvatar url={view.seller.avatarUrl} name={view.seller.displayName} />
              <span className="grow">
                <span className="t2 fqm-block">{view.isOwner ? 'Your listing' : 'Posted by'}</span>
                <span className="t1">{view.seller.displayName}</span>
              </span>
            </Link>
          )}
          <div className="fqm-ev-act">
            {claimToken ? (
              <ListingClaimBox
                token={claimToken}
                signedIn={!!myProfileId}
                signInHref={`/sign-in?next=${encodeURIComponent(`${detailPath}?claim=${claimToken}`)}`}
              />
            ) : showContact ? (
              <ListingContactDialog
                targetKind={view.commentTargetKind as OfferTargetKind}
                targetId={view.id}
                sellerName={sellerFirst}
                triggerLabel={`Message ${sellerFirst}`}
                viewerSignedIn={!!myProfileId}
                canOffer={!!myProfileId}
                highestOfferCents={view.highestOfferCents}
                revalidatePath={detailPath}
                triggerClassName="btn pa lg"
              />
            ) : null}
            <div className="row wrap">
              {view.isOwner && editHref && (
                <Link className="btn" href={editHref}>
                  <FqIcon name="edit" />
                  Edit listing
                </Link>
              )}
              <ListingShareButton path={detailPath} title={view.title} sharerProfileId={myProfileId} className="btn" />
            </div>
            {contactNote && <div className="t2">{contactNote}</div>}
          </div>
        </div>
      </section>

      <div className="ap-cols sec">
        <div className="stack fqm-secs">
          {(children || view.description) && (
            <div className="stack">
              <h2 className="h2">About</h2>
              {children}
              {view.description && <p className="body fqm-pre">{view.description}</p>}
            </div>
          )}
          {footer}
          {gallery.length > 1 && (
            <div className="stack">
              <h2 className="h2">Photos</h2>
              <EventGallery images={gallery} />
            </div>
          )}
          {view.pickup && (
            <div className="stack">
              <h2 className="h2">{view.pickup.precise ? 'Pickup location' : 'Pickup area'}</h2>
              <ListingLocationMap
                lat={view.pickup.lat}
                lng={view.pickup.lng}
                areaLabel={view.pickup.areaLabel}
                precise={view.pickup.precise}
                exactAddress={view.pickup.exactAddress}
              />
            </div>
          )}
          <div className="stack">
            <h2 className="h2">Questions</h2>
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
          </div>
        </div>

        <aside className="side">
          {asideExtras}
          {view.details.length > 0 && (
            <div className="panel stack">
              <span className="k">Item details</span>
              <div className="list">
                {view.details.map((d, i) => (
                  <div key={`${d.label}-${i}`}>
                    <span className="t2 grow">{d.label}</span>
                    <span className="t1">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {ownerControls && (
            <div className="panel stack">
              <span className="k">Manage your listing</span>
              {ownerControls}
            </div>
          )}
          {!view.isOwner && (
            <div className="soft stack fqm-gap-sm">
              <span className="h3">{cta.heading}</span>
              <span className="t2">{cta.body}</span>
              <Link className="btn sm fqm-tag-start" href={cta.href}>
                {cta.cta}
              </Link>
            </div>
          )}
        </aside>
      </div>
    </MembersBody>
  )
}
