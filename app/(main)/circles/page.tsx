import { BlockRender } from '@/lib/page-editor/block-render'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'
import { isWellFormed } from '@/lib/page-editor/templates'
import { pageContentMetadata } from '@/lib/page-content'
import { getCirclesIndexData, CONTENT_FALLBACK } from '@/lib/circles/index-data'
import { FqCirclesBody } from '@/components/frequency/members/circles/circles-body'
import { getCachedViewerProfile } from '@/lib/auth'
import { listNetworkedSpacesPage } from '@/lib/spaces/discovery'
import { loadNextMeetups } from '@/lib/circles/next-meetups'

// The Circles index, in the Frequency members kit (ADR-1880). The page stays editable: a document an
// operator published at /edit/circles wins and is drawn by <BlockRender> over the live index data
// (`metadata.circlesIndex`); until one exists the body is the kit's Circles page. Do NOT add a coded
// section here: `scripts/render-path-bodies.txt` records `circles 0` and check:render-path matches it.

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
  const published = await getPublishedData('circles')
  if (isWellFormed(published)) return <BlockRender config={config} data={published} metadata={{ circlesIndex }} />
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
