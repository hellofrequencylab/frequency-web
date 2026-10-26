import Link from 'next/link'
import { Plus, Settings2 } from 'lucide-react'
import { MarketHero } from '@/components/marketplace/market-hero'
import { HERO_PRIMARY_BTN, HERO_SECONDARY_BTN } from '@/components/marketplace/hero-buttons'
import { getMyProfileId } from '@/lib/auth'
import { normalizeSpaceSort } from '@/lib/spaces/discovery'
import { normalizePerPage, normalizePage } from '@/components/spaces/directory-view'
import { resolveMarketHero } from '@/lib/layout/index-hero'
import { listNetworkedSpaces } from '@/lib/spaces/discovery'
import { buildDirectorySections } from '@/lib/spaces/directory-sections'
import { FqSpacesBody } from '@/components/frequency/members/spaces/spaces-body'

// The Spaces DIRECTORY — the in-app surface where a member browses the networked entity Spaces
// (practitioners, businesses, organizations, coaching academies, event spaces) and opens one's
// profile (ENTITY-SPACES-BUILD §A/§B). It now opens on the SHARED MarketHero header (the same hero
// band Events / Marketplace Events / Circles use) so every browse surface reads as one header: a
// centered title, the search bar IN the hero, and the action buttons row (Create a Space + Manage
// Spaces). The search moved out of the toolbar into the hero; the toolbar keeps sort + the subject
// pills (the shared vocabulary, ADR-887) + Following. The grid + pager + "Go Business" sell are the SHARED directory body
// (components/spaces/directory-view), so this in-app surface and the public /discover/spaces surface
// never drift. The grid is its own <Suspense> so the header paints instantly and never blocks on the
// discovery read (PAGE-FRAMEWORK §5). The result set is PAGED (12/24/48), all URL-driven so a filtered
// + paged view stays shareable. Semantic DAWN tokens only, no hex, no em dashes.

export const metadata = {
  title: 'Business Spaces',
  description:
    'Browse the businesses and nonprofits in the Frequency network. See what each one offers, from classes to services to events, then follow or reach out.',
  // The indexable SEO twin is /discover/spaces; this in-app shell page canonicals there (and is kept out
  // of the crawl in robots.ts) so faceted URLs never index as duplicate content.
  alternates: { canonical: '/discover/spaces' },
}


export default async function SpacesDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    subject?: string
    category?: string
    following?: string
    sort?: string
    per?: string
    page?: string
    city?: string
    events?: string
    show?: string
  }>
}) {
  // `subject` is the toolbar's pill facet (the shared vocabulary, ADR-887); `category` is the LEGACY
  // kind param, still honored so an old shared link keeps its narrowed view.
  const {
    q,
    subject,
    category,
    following: followingParam,
    sort: sortParam,
    per: perParam,
    page: pageParam,
    city,
    events,
    show,
  } = await searchParams
  const following = followingParam === '1'
  const sort = normalizeSpaceSort(sortParam)
  const per = normalizePerPage(perParam)
  const page = normalizePage(pageParam)

  // The Create + Manage affordances are for signed-in members (each destination re-checks auth). The
  // viewer id also feeds the "Following" filter (a signed-out viewer follows nothing).
  const viewerProfileId = await getMyProfileId()

  // The whole hero band through the ONE browse-hero ladder (lib/layout/index-hero, PROG-P4):
  // the operator's Settings header image, then the page_content hero via the copy cascade, then
  // this page's coded cover, plus the operator-tunable header element (ADR-793) for
  // layout / height / scrim. It used to read the element alone, so an operator who uploaded a
  // header image for this route got nothing.
  const hero = await resolveMarketHero('/spaces/directory', { cover: '/images/site/business-directory-hero.jpg' })

  const heroEl = (
    <MarketHero
      {...hero}
      eyebrow="Directory"
      title="Business Spaces"
      subtitle="A Space is the home a studio, a shop or a nonprofit keeps here, and the Circles and Events they host hang off it. Find one near you, follow it, and turn up."
      // Under Frequency the one search box lives in the find row of the body (FqFindField), as on Circles.
      search={undefined}
      action={
        viewerProfileId ? (
          <>
            <Link href="/spaces/new" className={HERO_PRIMARY_BTN}>
              <Plus className="h-4 w-4" aria-hidden />
              Create a Space
            </Link>
            <Link href="/spaces/operating" className={HERO_SECONDARY_BTN}>
              <Settings2 className="h-4 w-4" aria-hidden />
              Manage Spaces
            </Link>
          </>
        ) : undefined
      }
    />
  )
  const [all, matched] = await Promise.all([
    listNetworkedSpaces({}),
    listNetworkedSpaces({
      q,
      subject,
      kind: category,
      followerProfileId: viewerProfileId,
      onlyFollowed: following,
      sort,
    }),
  ])
  const params = { q, subject, category, following: followingParam, sort: sortParam, city, events, show }
  return (
    <FqSpacesBody
      header={heroEl}
      sections={buildDirectorySections(all, matched, params)}
      params={params}
      signedIn={!!viewerProfileId}
    />
  )
}
