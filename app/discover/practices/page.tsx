import type { Metadata } from 'next'
import { listPublicPractices } from '@/lib/practices'
import { getPillars } from '@/lib/pillars'
import { SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { practiceListSchema, breadcrumbSchema } from '@/lib/jsonld'
import { IndexTemplate } from '@/components/templates'
import { BetaCTA } from '@/components/marketing/marketing-ui'
import { PracticeCard, PillarChips } from './practice-card'

export const revalidate = 3600

const TITLE = 'Practices'
const DESCRIPTION =
  "A Practice is one small real-world act you can actually keep up. Five minutes before your coffee, 30 seconds of cold water, a walk with no phone. Browse them by Pillar, then do them with people near you."

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
    <>
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

        {/* Public SEO surface: no operator admin bar (that's a member-app control). */}
        <IndexTemplate title={TITLE} description={DESCRIPTION} adminBar={false}>
          {pillars.length > 0 && <PillarChips pillars={pillars} active="all" />}

          {practices.length === 0 ? (
            <p className="text-muted">The library&apos;s still filling in. Check back in a few days.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {practices.map((p) => (
                <PracticeCard key={p.id} p={p} />
              ))}
            </ul>
          )}
        </IndexTemplate>
      </div>

      <BetaCTA
        heading="Practices are better with people."
        body="A Practice is one small real-world act, and it sticks when a few neighbors are doing it with you. Join the Beta and find your Circle."
      />
    </>
  )
}
