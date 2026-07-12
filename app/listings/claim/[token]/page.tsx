import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapPin, Tag, Zap } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { getMyProfileId } from '@/lib/auth'
import { resolveListingClaim } from '@/lib/listing-seeder/claim'
import { getListing as getMarketListing, LISTING_KINDS } from '@/lib/marketplace'
import { getListing as getBaseListing } from '@/lib/listings'
import { getHousingDetail, propertyTypeLabel } from '@/lib/listings/housing'
import { ClaimButton } from './claim-button'

export const dynamic = 'force-dynamic'

// The claim landing a poster reaches from the seeder outreach message — PUBLIC (outside the
// (main) shell, like /events/claim/[token]) so a signed-out poster can see what they are
// claiming. Resolves the seed-owned, UNCLAIMED listing by its one-time token; 404 when the
// token is unknown, already used, or the listing was removed, so a guessed token learns
// nothing. Signed-out → a sign-in CTA that returns here; signed-in → one-tap claim (the
// engine's claimListing does the checks and the ownership transfer).

/** A small, kind-agnostic preview shape the page renders. */
interface ClaimPreview {
  kindLabel: string
  location: string | null
  facts: string[]
  description: string | null
  image: string | null
}

/** First image only when it is an absolute URL (inputs carry public library-media URLs). */
function coverUrl(images: string[]): string | null {
  const first = images[0]
  return first && /^https?:\/\//.test(first) ? first : null
}

async function loadPreview(kind: 'classifieds' | 'housing', listingId: string): Promise<ClaimPreview> {
  if (kind === 'classifieds') {
    const l = await getMarketListing(listingId)
    return {
      kindLabel: LISTING_KINDS.find((k) => k.key === l?.kind)?.label ?? 'Classifieds',
      location: [l?.neighborhood, l?.city].filter(Boolean).join(', ') || null,
      facts: [l?.price_note, l?.category].filter((s): s is string => Boolean(s)),
      description: l?.description ?? null,
      image: coverUrl(l?.images ?? []),
    }
  }
  const [l, detail] = await Promise.all([getBaseListing(listingId), getHousingDetail(listingId)])
  const facts: string[] = []
  if (detail?.rentCents != null) facts.push(`$${Math.round(detail.rentCents / 100)}/mo`)
  if (detail?.bedrooms != null) facts.push(`${detail.bedrooms} bd`)
  if (detail?.bathrooms != null) facts.push(`${detail.bathrooms} ba`)
  return {
    kindLabel: propertyTypeLabel(detail?.propertyType ?? null) ?? 'Housing',
    location: [l?.neighborhood, l?.city].filter(Boolean).join(', ') || null,
    facts,
    description: l?.description ?? null,
    image: coverUrl(l?.images ?? []),
  }
}

export default async function ClaimListingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const claim = await resolveListingClaim(token)
  if (!claim) notFound()

  const [preview, myProfileId] = await Promise.all([
    loadPreview(claim.kind, claim.listingId),
    getMyProfileId(),
  ])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-16">
      <FocusTemplate
        width="narrow"
        divider={false}
        title="Claim your listing"
        description="A neighbor added this to Frequency so people nearby could find it. If it's yours, claim it to manage it."
      >
        <div className="w-full space-y-4">
          {/* The listing preview. */}
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            {preview.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.image} alt="" className="max-h-56 w-full object-cover" />
            )}
            <div className="p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                <Tag className="h-3.5 w-3.5 shrink-0" />
                {preview.kindLabel}
              </p>
              <p className="mt-1 text-base font-bold text-text">{claim.title || 'Untitled listing'}</p>
              <div className="mt-2 space-y-1 text-sm text-muted">
                {preview.location && (
                  <p className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-subtle" />
                    {preview.location}
                  </p>
                )}
                {preview.facts.length > 0 && (
                  <p className="text-subtle">{preview.facts.join(' · ')}</p>
                )}
              </div>
              {preview.description && (
                <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-text">{preview.description}</p>
              )}
            </div>
          </div>

          {/* What claiming does. */}
          <p className="flex items-start gap-2 text-sm text-muted">
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            Claiming makes it yours: you can edit the details, hear from people who are interested, and run
            it from your own account. It takes one tap.
          </p>

          {myProfileId ? (
            <ClaimButton token={token} />
          ) : (
            <div className="space-y-2">
              <Link
                href={`/sign-in?next=/listings/claim/${token}`}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                Sign in to claim it
              </Link>
              <p className="text-center text-xs text-subtle">
                New here? Signing in creates your account in a minute.
              </p>
            </div>
          )}
        </div>
      </FocusTemplate>
    </div>
  )
}
