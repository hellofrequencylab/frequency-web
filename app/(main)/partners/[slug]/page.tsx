import { notFound } from 'next/navigation'
import Link from 'next/link'
import { MapPin, Globe, Ticket, ScanLine } from 'lucide-react'
import { getPartnerView } from '@/lib/partners/read'
import { DetailTemplate } from '@/components/templates/detail-template'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { RowCard } from '@/components/cards/row-card'

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
      <DetailTemplate
        back={{ href: '/partners', label: 'All partners' }}
        title={partner.name}
        badges={
          partner.category ? (
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-surface-elevated text-muted font-medium capitalize">
              {partner.category}
            </span>
          ) : undefined
        }
        subtitle={
          <div className="flex items-center gap-4 flex-wrap">
            {partner.city && (
              <Link
                href="/partners"
                className="flex items-center gap-1 hover:text-primary-strong transition-colors"
              >
                <MapPin className="w-3 h-3 shrink-0" />
                {partner.city}
              </Link>
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
            <EmptyState
              icon={Ticket}
              title="No offers right now"
              description="This partner has nothing live at the moment. Browse the other partners while you wait."
              action={
                <Link
                  href="/partners"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
                >
                  Browse partners
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {partner.offers.map((o) => (
                <RowCard
                  key={o.id}
                  href="/partners"
                  anchor={
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
                      <Ticket className="h-4 w-4" />
                    </div>
                  }
                  title={o.title}
                  context={o.memberTerms ?? undefined}
                  description={o.description ?? undefined}
                />
              ))}
            </div>
          )}

          <p className="mt-4 flex flex-wrap items-center gap-1 text-xs text-subtle">
            <ScanLine className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Tap this partner&apos;s plaque or{' '}
            <Link
              href="/scan?hint=partner"
              className="font-semibold text-primary-strong hover:underline"
            >
              scan their code
            </Link>{' '}
            in person to claim an offer and earn zaps.
          </p>
        </div>
      </DetailTemplate>
    </div>
  )
}
