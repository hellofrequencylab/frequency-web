import type { Metadata } from 'next'
import Link from 'next/link'
import { MapPin, Store } from 'lucide-react'
import { listActivePartners } from '@/lib/partners/read'
import { SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { partnerListSchema, breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

const TITLE = 'Local partners'
const DESCRIPTION =
  'Local businesses in the Frequency community — find them, see member offers, and show up in person. A directory of the shops, studios, and makers near you.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/discover/partners' },
  openGraph: { title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION, url: '/discover/partners', type: 'website' },
  twitter: { card: 'summary_large_image', title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION },
}

export default async function PublicPartnersPage() {
  const partners = await listActivePartners().catch(() => [])

  return (
    <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
      <JsonLd
        data={[
          partnerListSchema(partners, TITLE),
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Partners', path: '/discover/partners' },
          ]),
        ]}
      />

      <header className="mb-10 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-text">{TITLE}</h1>
        <p className="mt-3 text-lg text-muted">{DESCRIPTION}</p>
      </header>

      {partners.length === 0 ? (
        <p className="text-muted">No partners listed yet. Check back soon.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {partners.map((p) => (
            <li key={p.id}>
              <Link
                href={`/discover/partners/${p.slug}`}
                className="flex h-full flex-col gap-2 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-border-strong hover:bg-surface-elevated"
              >
                <span className="flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
                    <Store className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-base font-semibold text-text">{p.name}</span>
                </span>
                {(p.category || p.city) && (
                  <span className="flex flex-wrap items-center gap-2 text-xs text-subtle">
                    {p.category && <span className="capitalize">{p.category}</span>}
                    {p.city && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {p.city}
                      </span>
                    )}
                  </span>
                )}
                {p.description && <p className="line-clamp-2 text-sm text-muted">{p.description}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
