import type { Metadata } from 'next'
import { BlockRender } from '@/lib/page-editor/block-render'
import { BlockDocJsonLd } from '@/lib/page-editor/block-seo'
import { config } from '@/lib/page-editor/config'
import { getPublishedPage, latestDay } from '@/lib/page-editor/data'
import { isWellFormed } from '@/lib/page-editor/templates'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLiveData } from '@/lib/page-editor/live-data'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'
import { FrequencyPeople } from '@/components/frequency/site/pages/people/frequency-people'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'

export const revalidate = 3600

export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.community)

// Article dates. Google requires datePublished/dateModified on an Article node, and every other
// pillar page stamps them as literals here; without them this URL published a dateless Article.
// Sourced from the page's own history: first shipped 2026-07-28, last revised 2026-08-05.
// They are PASSED THROUGH to BlockDocJsonLd below — a block document cannot know them, and the
// coded body that used to carry the other copy of them is gone.
const PUBLISHED = '2026-07-28'
const UPDATED = '2026-08-05'

// ONE RENDER PATH, THE FREQUENCY LOOK (SCAN-1128, ADR-1880). The page stays editable: a document an
// operator published at /edit/the-community wins and is drawn by <BlockRender>; until one exists the
// body is the Frequency People page. Do NOT add a coded section to this file:
// `scripts/render-path-bodies.txt` records `the-community 0` and `check:render-path` matches it EXACTLY.
export default async function TheCommunityPage() {
  const page = await getPublishedPage('the-community')
  const published = page?.doc ?? null
  if (!isWellFormed(published)) {
    return (
      <>
        <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.community)} />
        <FrequencyPeople />
      </>
    )
  }
  const live = await getLiveData(createAdminClient()).catch(() => null)
  return (
    <>
      {/* Breadcrumb is DERIVED from the route, not from copy, so it is emitted here rather than
          by any block. Everything editorial (Article, FAQPage) travels with the document. */}
      <JsonLd data={breadcrumbSchema([{ name: 'The Community', path: '/the-community' }])} />
      <BlockDocJsonLd data={published} path="/the-community" published={PUBLISHED} updated={latestDay(UPDATED, page?.published_at)} />
      <BlockRender config={config} data={published} metadata={live ? { live } : {}} />
    </>
  )
}
