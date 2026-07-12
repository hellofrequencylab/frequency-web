// Shared view-model for the STANDARDIZED marketplace listing detail page (Classifieds,
// Market, and Housing all render one ListingDetailTemplate). Three thin adapters map each
// vertical's domain object (MarketListingWithAuthor, CommerceProduct, Listing + HousingDetail)
// onto the common `ListingDetailView`, so the hero + info line + gallery + Q&A are authored once.
//
// Server-only: resolveImages touches the service-role storage client (getPublicUrl). Never import
// this from a client component — the template is a Server Component and passes the resolved plain
// data down to the client Q&A island.

import { createAdminClient } from '@/lib/supabase/admin'
import { LISTING_KINDS, type ListingKind, type MarketListingWithAuthor } from '@/lib/marketplace'
import type { CommerceProduct } from '@/lib/commerce/types'
import type { HousingDetail, Listing } from '@/lib/listings/types'

/** The listing table a comment thread hangs off (matches listing_comments.target_kind). */
export type ListingCommentTargetKind = 'market_listing' | 'listing' | 'product'

/** A primary call to action shown on the hero + repeated in the seller row. */
export interface ListingAction {
  kind: 'contact' | 'edit' | 'none'
  label: string
  href: string
}

/** The one shape every listing detail page renders through. */
export interface ListingDetailView {
  vertical: 'classifieds' | 'market' | 'housing'
  /** Which table the Q&A comments hang off. */
  commentTargetKind: ListingCommentTargetKind
  id: string
  title: string
  /** The lead image, shown large in the hero (images[0]). Null falls back to a gradient placeholder. */
  primaryImage: string | null
  /** Everything after the lead image, shown as the gallery thumbnail strip (images.slice(1)). */
  galleryImages: string[]
  /** The money line for the hero + info line (e.g. "$299, open to reasonable offers" or "$2,400/mo"). */
  priceLabel: string | null
  /** Extra terms after the price on the info line (e.g. a condition, "Deposit $500"). */
  terms: string | null
  /** The category tag/pill on the hero. */
  categoryLabel: string | null
  /** Place line for the info band (e.g. "Encinitas"). */
  locationLabel: string | null
  createdAt: string
  description: string | null
  seller: { handle: string; displayName: string; avatarUrl: string | null } | null
  action: ListingAction | null
  isOwner: boolean
  /** Non-active status ("closed", "sold", ...) surfaced as a muted chip; null when active. */
  status: string | null
  back: { href: string; label: string }
}

const KIND_LABEL: Record<ListingKind, string> = Object.fromEntries(
  LISTING_KINDS.map((k) => [k.key, k.label]),
) as Record<ListingKind, string>

const HOUSING_TYPE_LABEL: Record<string, string> = {
  rental: 'Rental',
  roommate: 'Roommate',
  sublet: 'Sublet',
  roommate_wanted: 'Roommate wanted',
  housing_wanted: 'Housing wanted',
}

/** Resolve stored image references to public URLs. A value already looking like a URL passes through
 *  untouched; a bare storage path resolves via the public event-media bucket (the same bucket the
 *  listing uploaders write to). Empty entries are dropped. */
function resolveImages(images: string[] | null | undefined): string[] {
  const refs = (images ?? []).map((s) => s?.trim()).filter((s): s is string => !!s)
  if (refs.length === 0) return []
  const admin = createAdminClient()
  return refs.map((ref) =>
    /^https?:\/\//i.test(ref) ? ref : admin.storage.from('event-media').getPublicUrl(ref).data.publicUrl,
  )
}

function firstName(displayName: string | null | undefined): string {
  return displayName?.trim().split(/\s+/)[0] || 'the seller'
}

// ── Classifieds (market_listings) ────────────────────────────────────────────
// price_note is already the free-text "price/terms" blob a seller wrote (e.g.
// "$299, open to reasonable offers. Cash or Venmo."), so it becomes priceLabel verbatim.

export function listingDetailFromMarket(
  listing: MarketListingWithAuthor,
  opts: { isOwner: boolean },
): ListingDetailView {
  const images = resolveImages(listing.images)
  const place = [listing.neighborhood, listing.city].filter(Boolean).join(', ') || null
  const seller = listing.author
    ? {
        handle: listing.author.handle,
        displayName: listing.author.display_name,
        avatarUrl: listing.author.avatar_url,
      }
    : null
  const action: ListingAction = opts.isOwner
    ? { kind: 'edit', label: 'Edit listing', href: `/classifieds/${listing.id}/edit` }
    : seller
      ? { kind: 'contact', label: `Contact ${firstName(seller.displayName)}`, href: `/people/${seller.handle}` }
      : { kind: 'none', label: '', href: '' }

  return {
    vertical: 'classifieds',
    commentTargetKind: 'market_listing',
    id: listing.id,
    title: listing.title,
    primaryImage: images[0] ?? null,
    galleryImages: images.slice(1),
    priceLabel: listing.price_note?.trim() || null,
    terms: null,
    categoryLabel: listing.category?.trim() || KIND_LABEL[listing.kind] || listing.kind,
    locationLabel: place,
    createdAt: listing.created_at,
    description: listing.description,
    seller,
    action,
    isOwner: opts.isOwner,
    status: listing.status !== 'active' ? listing.status : null,
    back: { href: '/classifieds', label: 'Classifieds' },
  }
}

// ── Market (commerce_products) ────────────────────────────────────────────────
// Pricing is nuanced (services, variants), so the page passes the priceLabel + seller + action it
// already computed. The purchase UI (Buy / variant picker / booking / reviews) stays in the page as
// children — only the money line + a Contact action ride the hero.

export function listingDetailFromProduct(
  product: CommerceProduct,
  opts: {
    isOwner: boolean
    priceLabel: string
    terms?: string | null
    seller?: { handle: string; displayName: string; avatarUrl: string | null } | null
    action?: ListingAction | null
  },
): ListingDetailView {
  return {
    vertical: 'market',
    commentTargetKind: 'product',
    id: product.id,
    title: product.title,
    // Product images are already resolved to URLs by the reader; resolveImages passes them through.
    primaryImage: product.images[0] ?? null,
    galleryImages: product.images.slice(1),
    priceLabel: opts.priceLabel,
    terms: opts.terms ?? (product.condition ? (product.condition === 'new' ? 'New' : 'Used') : null),
    categoryLabel: product.category?.trim() || null,
    locationLabel: null,
    createdAt: product.createdAt,
    description: product.description,
    seller: opts.seller ?? null,
    action: opts.action ?? { kind: 'none', label: '', href: '' },
    isOwner: opts.isOwner,
    status: product.status !== 'active' ? product.status : null,
    back: { href: '/market', label: 'Market' },
  }
}

// ── Housing (listings + housing_listings) ─────────────────────────────────────

function rent(cents: number | null): string | null {
  if (cents == null) return null
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo`
}

export function listingDetailFromHousing(
  listing: Listing & { owner: { id: string; displayName: string; handle: string; avatarUrl: string | null } | null },
  detail: HousingDetail | null,
  opts: { isOwner: boolean },
): ListingDetailView {
  const images = resolveImages(listing.images)
  const place = [listing.neighborhood, listing.city].filter(Boolean).join(', ') || null
  const seller = listing.owner
    ? { handle: listing.owner.handle, displayName: listing.owner.displayName, avatarUrl: listing.owner.avatarUrl }
    : null
  const action: ListingAction =
    !opts.isOwner && seller
      ? { kind: 'contact', label: `Message ${firstName(seller.displayName)}`, href: `/people/${seller.handle}` }
      : { kind: 'none', label: '', href: '' }

  return {
    vertical: 'housing',
    commentTargetKind: 'listing',
    id: listing.id,
    title: listing.title,
    primaryImage: images[0] ?? null,
    galleryImages: images.slice(1),
    priceLabel: detail ? rent(detail.rentCents) : null,
    terms: null,
    categoryLabel: detail ? HOUSING_TYPE_LABEL[detail.listingType] ?? detail.listingType : 'Housing',
    locationLabel: place,
    createdAt: listing.createdAt,
    description: listing.description,
    seller,
    action,
    isOwner: opts.isOwner,
    status: listing.status !== 'active' ? listing.status : null,
    back: { href: '/marketplace/housing', label: 'Housing' },
  }
}
