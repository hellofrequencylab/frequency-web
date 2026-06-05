import { notFound } from 'next/navigation'
import Link from 'next/link'
import { MapPin, Globe, Ticket } from 'lucide-react'
import { getPartnerView } from '@/lib/partners/read'
import { DetailTemplate } from '@/components/templates/detail-template'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'

export const dynamic = 'force-dynamic'

// Partner detail (Phase 3 partners module): a business + its live member offers.
export default async function PartnerPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const partner = await getPartnerView(slug)
  if (!partner) notFound()

  return (
    <div>
      <Link
        href="/partners"
        className="text-xs text-subtle hover:text-primary-strong transition-colors"
      >
        ← All partners
      </Link>

      <DetailTemplate
        title={partner.name}
        badges={
          partner.category ? (
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-surface-elevated text-muted font-medium">
              {partner.category}
            </span>
          ) : undefined
        }
        subtitle={
          <div className="flex items-center gap-4 flex-wrap">
            {partner.city && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3 shrink-0" />
                {partner.city}
              </span>
            )}
            {partner.address && <span>{partner.address}</span>}
            {partner.website && (
              <a
                href={partner.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-primary-strong transition-colors"
              >
                <Globe className="w-3 h-3 shrink-0" />
                Website
              </a>
            )}
          </div>
        }
      >
        {partner.description && (
          <p className="mt-1 text-sm text-text leading-relaxed max-w-2xl">
            {partner.description}
          </p>
        )}

        <div className="border-t border-border mt-6 pt-6">
          <SectionHeader title="Member offers" count={partner.offers.length} />

          {partner.offers.length === 0 ? (
            <EmptyState icon={Ticket} title="No offers right now" description="Check back soon." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {partner.offers.map((o) => (
                <div
                  key={o.id}
                  className="flex gap-3 rounded-2xl bg-surface-elevated/60 p-4"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
                    <Ticket className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-text">{o.title}</h3>
                    {o.memberTerms && (
                      <p className="mt-0.5 text-xs font-medium text-primary-strong">{o.memberTerms}</p>
                    )}
                    {o.description && (
                      <p className="mt-1 text-sm leading-relaxed text-muted">{o.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 text-xs text-subtle">
            Tap this partner&apos;s plaque or scan their code in person to claim an
            offer and earn zaps.
          </p>
        </div>
      </DetailTemplate>
    </div>
  )
}
