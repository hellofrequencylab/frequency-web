import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPublicCircle, getPublicCircles } from '@/lib/discover'
import { resolveDetailHero } from '@/lib/layout/detail-hero'
import { OG_SITE, SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, circleSchema } from '@/lib/jsonld'
import { FrequencyCircle } from '@/components/frequency/site/pages/discover/circles'

export const revalidate = 3600

// Pre-render the public circles the discover layer already lists (the same
// redaction-safe RPC the index and the sitemap read, capped at 200 server-side and
// ordered by member_count, so the set is bounded and the busiest circles are the
// ones that land in the prerender manifest). Without this the route never enters
// that manifest and `revalidate` above is inert. Newer circles still render on
// demand (dynamicParams defaults true) and join the set on revalidate.
// Falls back to [] when Supabase credentials are absent (CI / preview without env vars).
export async function generateStaticParams() {
  const circles = await getPublicCircles(200).catch(() => [])
  // The SLUG, not the id (LIVE-182): the prerendered param has to be the URL the sitemap
  // advertises and the canonical points at, or the manifest holds a set nothing links to.
  return circles.map((c) => ({ id: c.slug ?? c.id }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const circle = await getPublicCircle(id)
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
    alternates: { canonical: `/discover/circles/${circle.slug ?? circle.id}` },
    openGraph: {
      ...OG_SITE,
      title: `${circle.name} · ${SITE_NAME}`,
      description,
      url: `/discover/circles/${circle.slug ?? circle.id}`,
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
  const circle = await getPublicCircle(id)
  if (!circle) notFound()

  // 🔴 THE UUID FORM 308s TO THE SLUG (LIVE-182). Both resolve — a printed QR code, a pasted link
  // and an existing citation must all keep working — but exactly one of them is the URL, and a
  // page reachable at two addresses splits its own crawl signal. The canonical below says which;
  // the redirect makes the browser agree. Guarded on the slug actually differing, so this can
  // never loop, and issued only for the legacy form because a slug request is already correct.
  if (id !== circle.slug && circle.slug) permanentRedirect(`/discover/circles/${circle.slug}`)

  // The standard entity cover (PROG-P5, ADR-1117). This is the RUNG-3 case in production: the
  // public Circle read (`public_circle_by_id`) exposes no image at all, so the section default in
  // DETAIL_HERO_DEFAULTS is the only thing that can give this page a band. An operator who sets a
  // header image on /discover/circles in Settings replaces it for every public Circle at once.
  const hero = await resolveDetailHero(`/discover/circles/${circle.slug ?? circle.id}`)
  const schema = [
    breadcrumbSchema([
      { name: 'Discover', path: '/discover' },
      { name: 'Circles', path: '/discover/circles' },
      { name: circle.name, path: `/discover/circles/${circle.slug ?? circle.id}` },
    ]),
    // A circle as schema.org/Organization (a small local group) — the tested
    // helper so it stays consistent with every other /discover entity schema.
    circleSchema(circle),
  ]
  return (
    <>
      <JsonLd data={schema} />
      <FrequencyCircle circle={circle} image={hero.coverImage} />
    </>
  )
}
