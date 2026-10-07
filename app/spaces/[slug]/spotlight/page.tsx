import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { markAnonymousRender } from '@/lib/core/anonymous-render'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { readTagline } from '@/lib/spaces/tagline'
import { readSpaceSpotlight } from '@/lib/spaces/spotlight'
import { OG_SITE } from '@/lib/site'
import { SpaceSpotlight } from '@/components/spotlight/space-spotlight'

// A SPACE'S SPOTLIGHT, its shareable link page at /spaces/<slug>/spotlight (lib/spaces/spotlight.ts). Public
// and outside both (main) and (public), like the member Spotlight at /spotlight/<handle>: a link page wears
// only its own centered chrome, no app or marketing header. Not under /spotlight because Space slugs and
// member handles share no namespace (2 already collide in production); `spotlight` is a reserved Space page
// slug (lib/spaces/profile-pages.ts) so no owner page can shadow this route. FAIL-CLOSED: a Space that is not visible, or whose
// Spotlight is not published, 404s. CACHED: ISR with no viewer, the app/(public)/spaces pattern;
// markAnonymousRender comes before any read so no block can reach for cookies.
export const revalidate = 3600

export function generateStaticParams(): { slug: string }[] {
  return []
}

async function publishedSpace(slug: string) {
  const space = await getVisibleSpaceBySlug(slug, null)
  if (!space || !readSpaceSpotlight(space.preferences).published) return null
  return space
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  markAnonymousRender()
  const { slug } = await params
  const space = await publishedSpace(slug)
  if (!space) return { title: 'Spotlight', robots: { index: false } }
  const name = space.brandName?.trim() || space.name
  const description = (await readTagline(space.id)) ?? `${name} on Frequency`
  const url = `/spaces/${space.slug}/spotlight`
  // The share card itself is this segment's opengraph-image (the Space's own card, LIVE-853).
  return {
    title: name,
    description,
    alternates: { canonical: url },
    openGraph: { ...OG_SITE, type: 'website', title: name, description, url },
    twitter: { card: 'summary_large_image', title: name, description },
  }
}

export default async function SpaceSpotlightRoute({ params }: { params: Promise<{ slug: string }> }) {
  markAnonymousRender()
  const { slug } = await params
  const space = await publishedSpace(slug)
  if (!space) notFound()
  setActiveSpace(space)
  return <SpaceSpotlight space={space} tagline={await readTagline(space.id)} />
}
