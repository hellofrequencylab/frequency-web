import type { Metadata } from 'next'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { listPublicPractices } from '@/lib/practices'
import { SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { practiceListSchema, breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

const TITLE = 'Practices'
const DESCRIPTION =
  'The Frequency practice library — small, repeatable real-world acts that build a life and a community. Browse practices by what you want to grow, then do them with people near you.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/discover/practices' },
  openGraph: { title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION, url: '/discover/practices', type: 'website' },
  twitter: { card: 'summary_large_image', title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION },
}

export default async function PublicPracticesPage() {
  const practices = await listPublicPractices('trending').catch(() => [])

  return (
    <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
      <JsonLd
        data={[
          practiceListSchema(practices, TITLE),
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Practices', path: '/discover/practices' },
          ]),
        ]}
      />

      <header className="mb-10 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-text">{TITLE}</h1>
        <p className="mt-3 text-lg text-muted">{DESCRIPTION}</p>
      </header>

      {practices.length === 0 ? (
        <p className="text-muted">The library is filling in. Check back soon.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {practices.map((p) => (
            <li key={p.id}>
              <Link
                href={`/discover/practices/${p.id}`}
                className="flex h-full flex-col gap-2 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-border-strong hover:bg-surface-elevated"
              >
                <span className="flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
                    <Sparkles className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-base font-semibold text-text">{p.title}</span>
                </span>
                {p.subcategory && <span className="text-xs text-subtle">{p.subcategory.name}</span>}
                {(p.summary || p.description) && (
                  <p className="line-clamp-3 text-sm text-muted">{p.summary ?? p.description}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
