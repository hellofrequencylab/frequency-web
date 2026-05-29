import { notFound } from 'next/navigation'
import Link from 'next/link'
import { MapPin, Globe, Ticket } from 'lucide-react'
import { getPartnerView } from '@/lib/partners/read'

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

      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <h1 className="text-2xl font-bold text-text">{partner.name}</h1>
        {partner.category && (
          <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-surface-elevated text-muted font-medium">
            {partner.category}
          </span>
        )}
      </div>

      <div className="mt-1 flex items-center gap-4 flex-wrap text-xs text-subtle">
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

      {partner.description && (
        <p className="mt-4 text-sm text-text leading-relaxed max-w-2xl">
          {partner.description}
        </p>
      )}

      <div className="border-t border-border mt-6 pt-6">
        <h2 className="text-sm font-semibold text-text mb-3">Member offers</h2>

        {partner.offers.length === 0 ? (
          <p className="text-sm text-muted">No offers right now — check back soon.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {partner.offers.map((o) => (
              <div
                key={o.id}
                className="rounded-2xl border border-border bg-surface shadow-sm p-4"
              >
                <div className="flex items-center gap-2">
                  <Ticket className="w-4 h-4 text-primary-strong shrink-0" />
                  <h3 className="text-sm font-semibold text-text">{o.title}</h3>
                </div>
                {o.memberTerms && (
                  <p className="mt-1 text-xs font-medium text-primary-strong">{o.memberTerms}</p>
                )}
                {o.description && (
                  <p className="mt-1 text-xs text-muted">{o.description}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-xs text-subtle">
          Tap this partner&apos;s plaque or scan their code in person to claim an
          offer and earn zaps.
        </p>
      </div>
    </div>
  )
}
