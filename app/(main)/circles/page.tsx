import { pageContentMetadata } from '@/lib/page-content'
import { getCirclesIndexData, CONTENT_FALLBACK } from '@/lib/circles/index-data'
import { FqCirclesBody } from '@/components/frequency/members/circles/circles-body'
import { getCachedViewerProfile } from '@/lib/auth'
import { listNetworkedSpacesPage } from '@/lib/spaces/discovery'
import { loadNextMeetups } from '@/lib/circles/next-meetups'

// The Circles index — a TEMPLATE + BLOCKS surface (PAGE-FRAMEWORK). It now opens on the SHARED
// MarketHero header (the same hero band Events / Marketplace Events / Business Spaces use) so every
// browse surface reads as one header: a centered, keyword-forward H1, the search bar IN the hero,
// and the action buttons row (Start a Circle + Manage my Circles). The search moved out of the
// CirclesToolbar block into the hero (the block now renders format + sort only, so the two search
// inputs never duplicate). The BODY is the standardized, operator-rearrangeable Circles block layout
// rendered through Puck, fed the live index data (getCirclesIndexData) via `metadata.circlesIndex`.
// Semantic DAWN tokens only, no hex, no em dashes.


// Operator-set title/description also drive <title> + og/twitter cards (PX.2). The default title is
// the keyword-forward "Circles near you" (CONTENT-VOICE §8a: the phrase people search).
export function generateMetadata() {
  return pageContentMetadata('/circles', CONTENT_FALLBACK)
}

export default async function CirclesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; interest?: string; sort?: string; q?: string; channel?: string }>
}) {
  const sp = await searchParams
  const circlesIndex = await getCirclesIndexData(sp)
  const [nextMeetups, profile, spacesPage] = await Promise.all([
    loadNextMeetups(circlesIndex.myCircleIds),
    getCachedViewerProfile(),
    listNetworkedSpacesPage({}, { limit: 3 }).catch(() => ({ spaces: [], total: 0 })),
  ])
  const home = profile?.home_lat != null && profile?.home_lng != null ? { lat: profile.home_lat, lng: profile.home_lng } : null
  const featuredSpaces = spacesPage.spaces.map((sp) => ({
    slug: sp.slug,
    name: sp.name,
    tagline: sp.tagline,
    coverUrl: sp.coverUrl,
    logoUrl: sp.logoUrl,
  }))
  return <FqCirclesBody data={circlesIndex} params={sp} nextMeetups={nextMeetups} home={home} featuredSpaces={featuredSpaces} />
}
