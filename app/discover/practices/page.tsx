import type { Metadata } from 'next'
import { listPublicPractices } from '@/lib/practices'
import { emptyUnlessTransient } from '@/lib/discover'
import { getPillars } from '@/lib/pillars'
import { OG_SITE, ROOT_OG_IMAGES, SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { practiceListSchema, breadcrumbSchema } from '@/lib/jsonld'
import { resolveIndexHero } from '@/lib/layout/index-hero'
import { FrequencyPractices } from '@/components/frequency/site/pages/discover/practices'

export const revalidate = 3600

const TITLE = 'Practices'
const DESCRIPTION =
  "A Practice is one small real-world act you can actually keep up. Five minutes before your coffee, 30 seconds of cold water, a walk with no phone. Browse them by Pillar, then do them with people near you."

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/discover/practices' },
  openGraph: { ...OG_SITE, images: ROOT_OG_IMAGES, title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION, url: '/discover/practices', type: 'website' },
  twitter: { card: 'summary_large_image', title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION },
}

export default async function PublicPracticesPage() {
  const [practices, pillars] = await Promise.all([
    // The reader already resolves `[]` on a database answer (LIVE-331). What this catch still sees
    // is a thrown bug (log, empty) or a transport failure that outlasted the retry ladder, which is
    // rethrown so this ISR page keeps its last good copy instead of caching an empty library.
    listPublicPractices('trending').catch(emptyUnlessTransient('practices page')),
    getPillars().catch(() => []),
  ])

  const hero = await resolveIndexHero('/discover/practices')
  const schema = [
    practiceListSchema(practices, TITLE),
    breadcrumbSchema([
      { name: 'Discover', path: '/discover' },
      { name: 'Practices', path: '/discover/practices' },
    ]),
  ]
  return (
    <>
      <JsonLd data={schema} />
      <FrequencyPractices
        title={TITLE}
        description={DESCRIPTION}
        practices={practices}
        pillars={pillars}
        image={hero.heroImage}
      />
    </>
  )
}
