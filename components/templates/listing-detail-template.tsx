// Standardized marketplace listing detail page (Classifieds, Market, Housing all render THIS).
//
// Server Component: it hands the resolved ListingDetailView + comment data to the member kit's listing
// page (FqListingDetail), which owns the layout and the client islands.

import type { ListingDetailView } from '@/lib/listings-shared/detail-view'
import type { ListingComment } from '@/lib/marketplace/listing-comments'
import { FqListingDetail } from '@/components/frequency/members/marketplace/listing-detail'

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
  soloGalleryRow = true,
  asideExtras,
  heroBuy,
  heroMeta,
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
  /**
   * Whether a listing carrying ONE photo still gets a gallery row under the hero.
   *
   * Default true, because that is the owner directive this gallery was built for: a seller who
   * uploaded a single photo should still see a gallery row rather than only the hero.
   *
   * 🔴 A JOURNEY PASSES FALSE, and the difference is that its photo is not a photo the seller
   * chose to show twice. `setJourneyPriceAction` writes `images: [cover_image]`, so a Journey
   * product carries exactly one image BY CONSTRUCTION -- the cover -- and the row below the hero
   * is therefore always the hero again, back to back, on every Journey that has ever been priced.
   * A directive about a seller's photo set does not reach a photo set the system generated.
   */
  soloGalleryRow?: boolean
  /**
   * Extra blocks for the right rail, rendered ABOVE the contact/details modules (ADR-1401).
   *
   * 🔴 ADDITIVE, AND THAT IS THE WHOLE DESIGN. Classifieds, Housing and Market goods pass nothing
   * and are byte-identical. It exists because a Space-owned listing has a null `sellerProfileId`,
   * so `showContact` is false, and `view.details` is hardcoded empty for products — which left a
   * priced Journey reserving a 340px column and rendering NOTHING into it for its own owner, and
   * two lines of trust copy for everyone else. The column is the best real estate on the page; a
   * sticky buy box belongs there, not a hole.
   */
  asideExtras?: React.ReactNode
  /** Frequency design only: the buy control drawn in the hero beside the price. */
  heroBuy?: React.ReactNode
  /** Frequency design only: the trust line under the seller (verified badge, service terms). */
  heroMeta?: React.ReactNode
}) {
  // Every listing (Classifieds, the Market, Housing) is the member kit's listing page, on the same view
  // and islands.
  return (
    <FqListingDetail
      view={view}
      comments={comments}
      canComment={canComment}
      canModerate={canModerate}
      myProfileId={myProfileId}
      footer={footer}
      contactNote={contactNote}
      ownerControls={ownerControls}
      claimToken={claimToken}
      soloGalleryRow={soloGalleryRow}
      asideExtras={asideExtras}
      heroBuy={heroBuy}
      heroMeta={heroMeta}
    >
      {children}
    </FqListingDetail>
  )
}
