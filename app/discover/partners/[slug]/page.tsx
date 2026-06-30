import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapPin, Globe, Ticket, ChevronLeft } from 'lucide-react'
import { getPartnerView, listActivePartners } from '@/lib/partners/read'
import { SignInCta } from '@/components/discover/cards'
import { ShareButton } from '@/components/discover/share-button'
import { DetailTemplate } from '@/components/templates'
import { SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { localBusinessSchema, breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

export async function generateStaticParams() {
  const partners = await listActivePartners().catch(() => [])
  return partners.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const partner = await getPartnerView(slug)
  if (!partner) return { title: 'Partner not found' }

  const where = partner.city ? ` in ${partner.city}` : ''
  const full =
    partner.description ??
    `${partner.name}: a Frequency community partner${where}. Member offers and events.`
  const description = full.length > 155 ? `${full.slice(0, 152).trimEnd()}…` : full
  const ogTitle = `${partner.name} · ${SITE_NAME}`
  return {
    title: partner.name,
    description,
    alternates: { canonical: `/discover/partners/${partner.slug}` },
    openGraph: { title: ogTitle, description, url: `/discover/partners/${partner.slug}`, type: 'website' },
    twitter: { card: 'summary_large_image', title: ogTitle, description },
  }
}

export default async function PublicPartnerPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const partner = await getPartnerView(slug)
  if (!partner) notFound()

  return (
    <div className="mx-auto max-w-3xl px-6 py-20 sm:py-24">
      <JsonLd
        data={[
          localBusinessSchema(partner),
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Partners', path: '/discover/partners' },
            { name: partner.name, path: `/discover/partners/${partner.slug}` },
          ]),
        ]}
      />

      <Link
        href="/discover/partners"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-text"
      >
        <ChevronLeft className="h-4 w-4" />
        Partners
      </Link>

      <DetailTemplate
        title={partner.name}
        actions={
          <ShareButton
            path={`/discover/partners/${partner.slug}`}
            title={`${partner.name} · ${SITE_NAME}`}
            text={partner.description ?? `A community partner on ${SITE_NAME}.`}
            label="Share"
          />
        }
        badges={
          partner.category ? (
            <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-xs font-medium capitalize text-muted">
              {partner.category}
            </span>
          ) : undefined
        }
        subtitle={
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {(partner.address || partner.city) && (
              <span className="inline-flex items-center gap-1 text-muted">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {partner.address ?? partner.city}
              </span>
            )}
            {partner.website && (
              <a
                href={partner.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 text-primary-strong transition-colors hover:underline"
              >
                <Globe className="h-3.5 w-3.5 shrink-0" />
                Website
              </a>
            )}
          </div>
        }
      >
        {partner.description && (
          <p className="mb-8 max-w-2xl text-lg leading-relaxed text-muted whitespace-pre-line">
            {partner.description}
          </p>
        )}

        {partner.offers.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-subtle">Member offers</h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {partner.offers.map((o) => (
                <li key={o.id} className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
                    <Ticket className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text">{o.title}</p>
                    {o.description && <p className="mt-0.5 text-xs text-muted">{o.description}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <SignInCta
          title="Join Frequency to claim offers"
          body={`Become a member to claim ${partner.name}'s offers in person and earn zaps for showing up. Free to join.`}
          action="Get started"
        />
      </DetailTemplate>
    </div>
  )
}
