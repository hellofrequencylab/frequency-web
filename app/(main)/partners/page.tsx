import Link from 'next/link'
import { MapPin, Store, Tag } from 'lucide-react'
import { listActivePartners, type PartnerSummary } from '@/lib/partners/read'
import { PageHeader, StatStrip } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { getViewerGamStats } from '@/lib/viewer-stats'

export const dynamic = 'force-dynamic'

// Partner directory (Phase 3 partners module). Lists aligned local businesses;
// members find them here and unlock offers in person (NFC plaque / QR -> zaps).
export default async function PartnersPage() {
  const [partners, gam] = await Promise.all([
    listActivePartners(),
    getViewerGamStats(),
  ])

  const cities = new Set(partners.map((p) => p.city).filter(Boolean)).size
  const categories = new Set(partners.map((p) => p.category).filter(Boolean)).size

  return (
    <div>
      <PageHeader
        title="Partners"
        description="Local businesses that back the community. Walk in, tap their plaque or scan a code to unlock a members-only offer — and pick up zaps while you are at it."
        gam={gam}
      />

      {partners.length > 0 && (
        <StatStrip items={[
          { value: partners.length, label: 'Partners' },
          { value: cities, label: 'Cities' },
          { value: categories, label: 'Categories' },
        ]} />
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
    </div>
  )
}

function PartnerCard({ partner }: { partner: PartnerSummary }) {
  return (
    <Link
      href={`/partners/${partner.slug}`}
      className="flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm transition-all hover:border-primary-bg hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
          <Store className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-tight text-text">{partner.name}</p>
          {partner.city && (
            <span className="mt-0.5 flex items-center gap-1 text-xs text-subtle">
              <MapPin className="h-3 w-3" />{partner.city}
            </span>
          )}
        </div>
      </div>

      {partner.description && (
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted">{partner.description}</p>
      )}

      {partner.category && (
        <div className="mt-auto flex items-center gap-1 pt-4 text-xs text-subtle">
          <Tag className="h-3 w-3" />
          <span className="capitalize">{partner.category}</span>
        </div>
      )}
    </Link>
  )
}
