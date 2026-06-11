import Link from 'next/link'
import { MapPin, Store, Tag, Check, ScanLine } from 'lucide-react'
import {
  listActivePartners,
  listLiveOffers,
  type PartnerSummary,
  type LiveOffer,
} from '@/lib/partners/read'
import { getMyProfileId } from '@/lib/auth'
import { IndexTemplate } from '@/components/templates/index-template'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { EntityCard } from '@/components/cards/entity-card'
import { RowCard } from '@/components/cards/row-card'

export const dynamic = 'force-dynamic'

// Partner directory (Phase 3 partners module) + the offers-first surface behind
// the Zap menu's Partners tile (ADR-236): live offers lead, each carrying the
// viewer's unlocked state; the business directory follows. Unlocking stays a
// REAL-WORLD act — walk in, scan the plaque (/scan) — this page never claims.
export default async function PartnersPage() {
  const profileId = await getMyProfileId()
  const [partners, offers] = await Promise.all([
    listActivePartners(),
    listLiveOffers(profileId),
  ])

  const cities = new Set(partners.map((p) => p.city).filter(Boolean)).size
  const categories = new Set(partners.map((p) => p.category).filter(Boolean)).size

  return (
    <IndexTemplate
      title="Partners"
      description="Local businesses that back the community. Walk in, tap their plaque or scan a code to claim a members-only offer, and pick up Zaps while you’re at it."
    >
      {offers.length > 0 && (
        <section className="mb-8">
          <SectionHeader title="Offers right now" count={offers.length} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {offers.map((o) => (
              <OfferCard key={o.id} offer={o} />
            ))}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-subtle">
            <ScanLine className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Offers unlock in person: walk in and{' '}
            <Link href="/scan?hint=partner" className="font-semibold text-primary-strong hover:underline">
              scan the partner&rsquo;s plaque
            </Link>
            . Zaps ride along.
          </p>
        </section>
      )}

      <section>
        {/* Counts stay quiet inline context (the gamified-stat law, MEMBER-DESIGN-SYSTEM §2) —
            never a KPI tile on a member page. */}
        <SectionHeader
          title="All partners"
          count={partners.length}
          action={
            cities > 0 ? (
              <p className="text-xs text-subtle">
                {cities} {cities === 1 ? 'city' : 'cities'}
                {categories > 0 && <> · {categories} {categories === 1 ? 'category' : 'categories'}</>}
              </p>
            ) : undefined
          }
        />
        {partners.length === 0 ? (
          <EmptyState
            icon={Store}
            title="No partners yet"
            description="Aligned local businesses will show up here as they join. Check back soon."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {partners.map((p) => (
              <PartnerCard key={p.id} partner={p} />
            ))}
          </div>
        )}
      </section>
    </IndexTemplate>
  )
}

function PartnerCard({ partner }: { partner: PartnerSummary }) {
  return (
    <EntityCard
      href={`/partners/${partner.slug}`}
      anchor={
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
          <Store className="h-6 w-6" />
        </div>
      }
      title={partner.name}
      context={
        partner.city ? (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {partner.city}
          </span>
        ) : undefined
      }
      description={partner.description ?? undefined}
      meta={
        partner.category ? (
          <span className="flex items-center gap-1 capitalize">
            <Tag className="h-3 w-3" />
            {partner.category}
          </span>
        ) : undefined
      }
    />
  )
}

// One live offer: what you get, who gives it, whether you've already unlocked it.
// A dense list row (RowCard, the kit's compact browse card) — the unlocked/until
// state rides as the passive trailing chip.
function OfferCard({ offer }: { offer: LiveOffer }) {
  const until = offer.validUntil
    ? new Date(offer.validUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null
  return (
    <RowCard
      href={`/partners/${offer.partner.slug}`}
      title={offer.title}
      description={offer.description ?? undefined}
      meta={
        <span className="flex items-center gap-1 font-medium text-primary-strong">
          <Store className="h-3 w-3 shrink-0" aria-hidden />
          {offer.partner.name}
          {offer.partner.city && <span className="font-normal text-subtle">· {offer.partner.city}</span>}
        </span>
      }
      trailing={
        offer.redeemedAt ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-success-bg/50 px-2 py-0.5 text-2xs font-semibold text-success">
            <Check className="h-3 w-3" /> Unlocked
          </span>
        ) : until ? (
          <span className="shrink-0 rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-subtle">
            Until {until}
          </span>
        ) : undefined
      }
    />
  )
}
