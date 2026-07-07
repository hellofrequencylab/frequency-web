import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Users, MapPin, ChevronLeft } from 'lucide-react'
import { getPublicCircleById } from '@/lib/discover'
import { InlineBetaCapture } from '@/components/discover/inline-beta-capture'
import { RippleRings } from '@/components/marketing/vector-art'
import { DetailTemplate } from '@/components/templates'
import { SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, circleSchema } from '@/lib/jsonld'

export const revalidate = 3600

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const circle = await getPublicCircleById(id)
  if (!circle) return { title: 'Circle not found' }

  const where = circle.city ? ` in ${circle.city}` : ''
  const full =
    circle.about ??
    `${circle.name} is a Frequency circle${where}. Join to meet your neighbors and show up in person.`
  // Search snippets truncate around 155 chars — keep the meta description tight (matches the
  // other discover detail pages: journeys, events, partners, practices).
  const description = full.length > 155 ? `${full.slice(0, 152).trimEnd()}…` : full
  return {
    title: circle.name,
    description,
    alternates: { canonical: `/discover/circles/${circle.id}` },
    openGraph: {
      title: `${circle.name} · ${SITE_NAME}`,
      description,
      url: `/discover/circles/${circle.id}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${circle.name} · ${SITE_NAME}`,
      description,
    },
  }
}

export default async function CirclePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const circle = await getPublicCircleById(id)
  if (!circle) notFound()

  return (
    <div className="relative overflow-hidden max-w-3xl mx-auto px-6 py-20 sm:py-24">
      {/* Ripple rings: a circle widening out, the motif for this surface. */}
      <RippleRings
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 w-[30rem] max-w-none text-primary opacity-[0.05]"
      />
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Circles', path: '/discover/circles' },
            { name: circle.name, path: `/discover/circles/${circle.id}` },
          ]),
          // A circle as schema.org/Organization (a small local group) — the tested
          // helper so it stays consistent with every other /discover entity schema.
          circleSchema(circle),
        ]}
      />

      <Link
        href="/discover/circles"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-text"
      >
        <ChevronLeft className="h-4 w-4" />
        Circles
      </Link>

      <DetailTemplate
        title={circle.name}
        subtitle={
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              {circle.member_count} {circle.member_count === 1 ? 'member' : 'members'}
            </span>
            {circle.city && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-4 h-4" />
                {circle.city}
              </span>
            )}
            {circle.channel_name && circle.channel_slug && (
              <Link
                href={`/discover/topics/${circle.channel_slug}`}
                className="inline-flex items-center gap-1 text-primary-strong hover:underline"
              >
                {circle.channel_name}
              </Link>
            )}
          </div>
        }
        badges={
          circle.status === 'forming' ? (
            <span className="text-xs px-2 py-1 rounded-md font-medium bg-warning-bg text-warning capitalize">
              forming
            </span>
          ) : undefined
        }
      >
        {/* About */}
        {circle.about ? (
          <section className="mb-10">
            <p className="text-lg text-muted leading-relaxed whitespace-pre-line">{circle.about}</p>
          </section>
        ) : (
          <section className="mb-10">
            <p className="text-lg text-muted leading-relaxed">
              A small standing group of neighbors gathering in person around what they share.
              Up to fifty people, close enough to walk to, small enough that the regulars learn
              your name and notice the week you go missing.
            </p>
          </section>
        )}

        {/* Inline capture: someone reading a single Circle is the warmest lead
            on the site. Offer the invite here, where intent peaks, instead of
            bouncing them to /sign-in. Falls back to the same double-opt-in funnel
            as the list pages, tagged for attribution. */}
        <InlineBetaCapture
          source="discover_circle_detail"
          heading={`Want in on ${circle.name}?`}
          body="Circles are small on purpose: up to 50 neighbors, no audition, two words to belong. Join the beta to request a spot, see the standing times, and start showing up for people who'll keep a seat warm for you."
        />
      </DetailTemplate>
    </div>
  )
}
