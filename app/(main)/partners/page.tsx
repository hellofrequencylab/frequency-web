import { MapPin, Store, Tag } from 'lucide-react'
import { listActivePartners, type PartnerSummary } from '@/lib/partners/read'
import { IndexTemplate } from '@/components/templates/index-template'
import { StatStrip } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { EntityCard } from '@/components/cards/entity-card'

export const dynamic = 'force-dynamic'

// Partner directory (Phase 3 partners module). Lists aligned local businesses;
// members find them here and unlock offers in person (NFC plaque / QR -> zaps).
// On the shared IndexTemplate + EntityCard (REDESIGN-INAPP Phase 1). The viewer's
// gamification stats live in the right-rail dock, so no per-page strip here.
export default async function PartnersPage() {
  const partners = await listActivePartners()

  const cities = new Set(partners.map((p) => p.city).filter(Boolean)).size
  const categories = new Set(partners.map((p) => p.category).filter(Boolean)).size

  return (
    <IndexTemplate
      title="Partners"
      description="Local businesses that back the community. Walk in, tap their plaque or scan a code to unlock a members-only offer — and pick up zaps while you’re at it."
    >
      {partners.length > 0 && (
        <div className="mb-6">
          <StatStrip
            items={[
              { value: partners.length, label: 'Partners' },
              { value: cities, label: 'Cities' },
              { value: categories, label: 'Categories' },
            ]}
          />
        </div>
      )}

      <section>
        <SectionHeader title="All partners" count={partners.length} />
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
