import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { listNetworkedSpaces } from '@/lib/spaces/discovery'
import { DIRECTORY_TYPES, spaceTypeLabel } from '@/components/spaces/space-type'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, spaceListSchema } from '@/lib/jsonld'
import { OG_SITE, ROOT_OG_IMAGES, SITE_NAME, SITE_URL } from '@/lib/site'
import { FrequencySpaceTypeHub } from '@/components/frequency/site/pages/discover/spaces'

export const revalidate = 3600

// A programmatic hub per Space type. Each is a crawlable landing page that borrows the root domain's
// authority and links out to every networked Space of its type, thickening the internal link graph.
// A hub with fewer than this many Spaces is noindex'd so a thin page never advertises itself. After
// the ADR-552 collapse the two public types are Business and Non Profit.
const HUB_MIN_INDEX = 3

const TYPE_HUBS: Record<string, { plural: string; blurb: string }> = {
  business: { plural: 'Businesses', blurb: 'studios, gyms, practitioners, and brands with classes and memberships' },
  nonprofit: { plural: 'Non Profits', blurb: 'non-profits and mission-driven groups raising support and running programs' },
}

export function generateStaticParams() {
  return DIRECTORY_TYPES.map((t) => ({ type: t.value }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>
}): Promise<Metadata> {
  const { type } = await params
  const hub = TYPE_HUBS[type]
  if (!hub) return { title: 'Not found' }

  const spaces = await listNetworkedSpaces({ type })
  const title = `${hub.plural} on ${SITE_NAME}`
  const description = `Browse ${hub.plural.toLowerCase()} on ${SITE_NAME}: ${hub.blurb}. Free to browse, and every profile is claimable.`
  const canonical = `/discover/spaces/${type}`
  return {
    title,
    description,
    alternates: { canonical },
    // Guard the index signal: a hub with too few Spaces should not be advertised as a landing page.
    ...(spaces.length >= HUB_MIN_INDEX ? {} : { robots: { index: false, follow: true } }),
    openGraph: { ...OG_SITE, images: ROOT_OG_IMAGES, title, description, url: canonical, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function DiscoverSpacesByTypePage({
  params,
}: {
  params: Promise<{ type: string }>
}) {
  const { type } = await params
  const hub = TYPE_HUBS[type]
  if (!hub) notFound()

  const spaces = await listNetworkedSpaces({ type })
  const label = spaceTypeLabel(type)
  const schema = [
    breadcrumbSchema([
      { name: 'Discover', path: '/discover' },
      { name: 'Spaces', path: '/spaces' },
      { name: hub.plural, path: `/discover/spaces/${type}` },
    ]),
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${hub.plural} on ${SITE_NAME}`,
      url: `${SITE_URL}/discover/spaces/${type}`,
    },
    spaces.length > 0 && spaceListSchema(spaces, `${hub.plural} on ${SITE_NAME}`),
  ].filter(Boolean)
  return (
    <>
      <JsonLd data={schema} />
      <FrequencySpaceTypeHub type={type} hub={hub} hubs={TYPE_HUBS} label={label} spaces={spaces} />
    </>
  )
}
