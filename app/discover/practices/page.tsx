import type { Metadata } from 'next'
import { listPublicPractices } from '@/lib/practices'
import { getPillars } from '@/lib/pillars'
import { SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { practiceListSchema, breadcrumbSchema } from '@/lib/jsonld'
import { PracticeCard, PillarChips } from './practice-card'

export const revalidate = 3600

const TITLE = 'Practices'
const DESCRIPTION =
  'The Frequency practice library, small, repeatable real-world acts that build a life and a community. Browse practices by what you want to grow, then do them with people near you.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/discover/practices' },
  openGraph: { title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION, url: '/discover/practices', type: 'website' },
  twitter: { card: 'summary_large_image', title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION },
}

export default async function PublicPracticesPage() {
  const [practices, pillars] = await Promise.all([
    listPublicPractices('trending').catch(() => []),
    getPillars().catch(() => []),
  ])

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

      <header className="mb-8 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-text">{TITLE}</h1>
        <p className="mt-3 text-lg text-muted">{DESCRIPTION}</p>
      </header>

      {pillars.length > 0 && <PillarChips pillars={pillars} active="all" />}

      {practices.length === 0 ? (
        <p className="text-muted">The library is filling in. Check back soon.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {practices.map((p) => (
            <PracticeCard key={p.id} p={p} />
          ))}
        </ul>
      )}
    </div>
  )
}
