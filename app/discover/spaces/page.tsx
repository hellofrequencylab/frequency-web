import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { spaceListSchema, breadcrumbSchema } from '@/lib/jsonld'
import { OG_SITE, ROOT_OG_IMAGES, SITE_NAME } from '@/lib/site'
import { listNetworkedSpacesPage, normalizeSpaceSort } from '@/lib/spaces/discovery'
import { normalizePerPage, normalizePage } from '@/components/spaces/directory-view'
import { resolveMarketHero } from '@/lib/layout/index-hero'
import { FrequencySpacesDirectory } from '@/components/frequency/site/pages/discover/spaces'
import { listActivePartners } from '@/lib/partners/read'
import { emptyUnlessTransient } from '@/lib/discover'

// PUBLIC Business Spaces directory (/discover/spaces) — the indexable, no-rail twin of the in-app directory
// (/spaces/directory). It renders inside the shared /discover chrome (SiteHeader + footer, no left menu, no
// community right rail), so a logged-out visitor or a crawler sees the same browse feature the members' app
// has: the search + category toolbar, the paged card grid, and the "Go Business" sell. The grid + pager + CTA
// are the SHARED directory body (components/spaces/directory-view), so the two surfaces never drift. Public
// contract mirrors the rest of /discover: no operator admin bar, no per-viewer state (viewerProfileId is null,
// the "Following" filter is hidden), ISR-cached, and an ItemList + breadcrumb JSON-LD for answer engines.

// Public designators per NAMING.md (ADR-552): a Space is a "Business" or a "Non Profit". The retired
// type words (practitioner / organization / coaching / studio / shop) never appear in public copy.
const TITLE = 'Businesses and nonprofits near you'
const DESCRIPTION =
  'Browse businesses, Non Profits and community groups on Frequency. Read about their classes, services and events, then follow or reach out.'
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/discover/spaces' },
  openGraph: { ...OG_SITE, images: ROOT_OG_IMAGES, title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION, url: '/discover/spaces', type: 'website' },
  twitter: { card: 'summary_large_image', title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION },
}

// Revalidate hourly — the network of listed Spaces changes often enough to keep fresh, rarely enough that we
// don't need per-request rendering for crawlers (matches the rest of /discover).
export const revalidate = 3600

export default async function PublicSpacesDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    subject?: string
    category?: string
    sort?: string
    per?: string
    page?: string
  }>
}) {
  // `subject` is the toolbar's pill facet (the shared vocabulary, ADR-887); `category` is the LEGACY
  // kind param, still honored so an old shared link keeps its narrowed view.
  const { q, subject, category, sort: sortParam, per: perParam, page: pageParam } = await searchParams
  const sort = normalizeSpaceSort(sortParam)
  const per = normalizePerPage(perParam)
  const page = normalizePage(pageParam)

  // One public read — no viewer (a logged-out surface follows nothing), so no auth call and the page stays
  // cacheable. The same data feeds both the list schema and the body.
  const { spaces, total } = await listNetworkedSpacesPage(
    { q, subject, kind: category, sort },
    { limit: per, offset: (page - 1) * per },
  )


  // The whole hero band through the ONE browse-hero ladder (lib/layout/index-hero, PROG-P4):
  // the operator's Settings header image, then the page_content hero via the copy cascade, then
  // this page's coded cover, plus the operator-tunable header element (ADR-793) for
  // layout / height / scrim. It used to read the element alone, so an operator who uploaded a
  // header image for this route got nothing.
  const hero = await resolveMarketHero('/discover/spaces', { cover: '/images/site/business-directory-hero.jpg' })
  const schema = [
    spaceListSchema(spaces, TITLE),
    breadcrumbSchema([
      { name: 'Discover', path: '/discover' },
      { name: 'Business Spaces', path: '/discover/spaces' },
    ]),
  ]
  // The partners section (/discover/partners merged here, owner ruling 2026-10-14). The same
  // fail-closed reader the old page used: a database answer renders no section, a transport failure
  // rethrows so this ISR page keeps its last good copy.
  const partners = await listActivePartners().catch(emptyUnlessTransient('spaces page partners'))
  return (
    <>
      <JsonLd data={schema} />
      <FrequencySpacesDirectory
        spaces={spaces}
        total={total}
        query={{ q, subject, category, sort, per, page }}
        image={hero.image}
        partners={partners}
      />
    </>
  )
}
