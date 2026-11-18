// /courses/business-of-community: the sales page for The Business of Community 101. Public and
// indexable. An EDITABLE_PAGES slug, on the /the-community pattern (ADR-1880): an operator's published
// document wins and is drawn by <BlockRender>; until one exists the body is the Frequency kit page
// (components/frequency/site/pages/courses/business-of-community.tsx), the approved design (owner
// 2026-11-18). The code template (lib/page-editor/templates/business-of-community.ts) stays the editor's
// starting document. templates.test.ts asserts it renders under the current block config.
//
// SCHEMA, and who emits each node:
//   · Course      here, from the live Journey (lib/courses/course-page.ts): its Run on the calendar, guides,
//                 outcomes and parts. The static facts below are the fallback when the Journey cannot be read.
//   · WebPage     <BlockDocJsonLd>, from this route's own title and description (a published document only).
//   · FAQPage     the kit page's questions (BOC_FAQ), or a published document's Accordion block.
//   · Breadcrumb  here: a block cannot know the route's place in the site.
//
// ⚠️ Do NOT add a coded section to this file. scripts/render-path-bodies.txt records
// `business-of-community 0` and check:render-path matches it exactly. New structure belongs in a block.
import type { Metadata } from 'next'
import type { Data } from '@/lib/page-editor/types'
import { BlockRender } from '@/lib/page-editor/block-render'
import { BlockDocJsonLd } from '@/lib/page-editor/block-seo'
import { config } from '@/lib/page-editor/config'
import { getPublishedPage, latestDay } from '@/lib/page-editor/data'
import { isWellFormed } from '@/lib/page-editor/templates'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, courseSchema } from '@/lib/jsonld'
import { coursePageSchema, loadCoursePage } from '@/lib/courses/course-page'
import { LIBRARY_NAME } from '@/lib/courses/tracks'
import { FrequencyBusinessOfCommunity } from '@/components/frequency/site/pages/courses/business-of-community'
import { OG_SITE, SITE_NAME } from '@/lib/site'

export const revalidate = 3600

const SLUG = 'business-of-community'
const JOURNEY_SLUG = 'the-business-of-community-101'
const PATH = '/courses/business-of-community'
const COURSE_NAME = 'The Business of Community 101'
const TITLE = 'The Business of Community 101: free core training'
const DESCRIPTION =
  'Frequency’s free four-week live workshop for anyone who gathers people. Four simple meetings on the PULSE rhythm, live on Zoom and run several times a year.'
const IMAGE = '/brand/frequency/photos/boc-circle-dusk.jpg'
const PUBLISHED = '2026-11-17'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: PATH },
    openGraph: {
      ...OG_SITE,
      title: `${COURSE_NAME} · ${SITE_NAME}`,
      description: DESCRIPTION,
      url: PATH,
      type: 'website',
      images: [{ url: IMAGE }],
    },
    // Metadata merges per top-level key: set twitter too, or the card serves the root's generic copy.
    twitter: { card: 'summary_large_image', title: `${COURSE_NAME} · ${SITE_NAME}`, description: DESCRIPTION },
  }
}

export default async function BusinessOfCommunityPage() {
  const [page, course] = await Promise.all([getPublishedPage(SLUG), loadCoursePage(JOURNEY_SLUG).catch(() => null)])
  const published = page?.doc ?? null
  const data: Data | null = isWellFormed(published) ? published : null
  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: LIBRARY_NAME, path: '/courses' },
            { name: COURSE_NAME, path: PATH },
          ]),
          course
            ? coursePageSchema(course)
            : courseSchema({
                name: COURSE_NAME,
                description: DESCRIPTION,
                path: PATH,
                image: IMAGE,
                free: true,
                schedule: { duration: 'PT1H30M', repeatFrequency: 'Weekly', repeatCount: 4 },
              }),
        ]}
      />
      {data ? (
        <>
          <BlockDocJsonLd
            data={data}
            path={PATH}
            title={TITLE}
            description={DESCRIPTION}
            published={PUBLISHED}
            updated={latestDay(PUBLISHED, page?.published_at)}
            image={IMAGE}
            schemaType="WebPage"
          />
          <BlockRender config={config} data={data} />
        </>
      ) : (
        <FrequencyBusinessOfCommunity />
      )}
    </>
  )
}
