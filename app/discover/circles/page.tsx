import type { Metadata } from 'next'
import { getPublicCircles } from '@/lib/discover'
import { CircleCard } from '@/components/discover/cards'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, circleListSchema } from '@/lib/jsonld'
import { SITE_NAME } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Local circles',
  description:
    'Browse the local circles forming on Frequency — small groups of up to 50 neighbors meeting in person around something they share.',
  alternates: { canonical: '/discover/circles' },
  openGraph: {
    title: `Local circles — ${SITE_NAME}`,
    description: 'Browse the local circles forming on Frequency and find your people.',
    url: '/discover/circles',
  },
}

export const revalidate = 3600

export default async function DiscoverCirclesPage() {
  const circles = await getPublicCircles(200)

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Circles', path: '/discover/circles' },
          ]),
          circleListSchema(circles, 'Local circles on Frequency'),
        ]}
      />

      <section className="bg-marketing-canvas px-6 py-16 border-b border-border/60">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-strong mb-3">
            Discover
          </p>
          <h1 className="text-3xl sm:text-5xl font-bold text-text mb-4">Local circles</h1>
          <p className="text-muted leading-relaxed max-w-2xl mx-auto">
            Small groups of up to 50 neighbors, meeting in person around something they share.
            Browse freely — join a free account to take part.
          </p>
        </div>
      </section>

      <section className="bg-surface px-6 py-16">
        <div className="max-w-6xl mx-auto">
          {circles.length === 0 ? (
            <p className="text-center text-muted">No public circles yet — check back soon.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {circles.map((c) => (
                <CircleCard key={c.id} circle={c} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
