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
import { FrequencySpaces } from '@/components/frequency/site/pages/spaces/frequency-spaces'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'

export const revalidate = 3600

// Not the bare word (SCAN-678): say who the page is for, which is what the query says. Shared with
// the Article headline below so the two cannot drift (SCAN-802).
const TITLE = 'Spaces for businesses, studios and organizations'

export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.spaces)

// ONE RENDER PATH, THE FREQUENCY LOOK (SCAN-1128, ADR-1880). The page stays editable: a document an
// operator published at /edit/spaces wins and is drawn by <BlockRender>; until one exists the body is
// the Frequency Spaces page. Do NOT add a coded section to this file: `scripts/render-path-bodies.txt`
// records `spaces 0` and `check:render-path` matches it EXACTLY.
// Article dates (SCAN-781). datePublished is the day this route first shipped (repository history:
// 2026-06-24); dateModified is the later of the template's last revision (2026-09-21) and the pages row's
// real published_at, so a Publish from /edit moves it and nothing is invented when none exists.
const PUBLISHED = '2026-06-24'
const UPDATED = '2026-09-21'

export default async function SpacesPage() {
  const page = await getPublishedPage('spaces')
  const published = page?.doc ?? null
  if (!isWellFormed(published)) {
    return (
      <>
        <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.spaces)} />
        <FrequencySpaces />
      </>
    )
  }
  const live = await getLiveData(createAdminClient()).catch(() => null)
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'Spaces', path: '/spaces' }])} />
      <BlockDocJsonLd
        data={published}
        path="/spaces"
        title={TITLE}
        published={PUBLISHED}
        updated={latestDay(UPDATED, page?.published_at)}
      />
      <BlockRender config={config} data={published} metadata={live ? { live } : {}} />
    </>
  )
}
