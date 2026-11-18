// /courses/business-of-community: the sales page for The Business of Community 101. Public and
// indexable. An EDITABLE_PAGES slug: an operator's published document wins, then the code template
// (lib/page-editor/templates/business-of-community.ts), the LAST rung. templates.test.ts asserts the
// template renders under the current block config, so the fall to EMPTY below cannot happen quietly.
//
// SCHEMA, and who emits each node:
//   · Course      here, from the course's facts (free, four weekly sessions of about an hour).
//   · WebPage     <BlockDocJsonLd>, from this route's own title and description.
//   · FAQPage     the document's Accordion block, from the questions a visitor can read.
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
import { getTemplate, isWellFormed } from '@/lib/page-editor/templates'
import { BOC_JOURNEY_PATH } from '@/lib/page-editor/templates/business-of-community'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, courseSchema } from '@/lib/jsonld'
import { OG_SITE, SITE_NAME } from '@/lib/site'

export const revalidate = 3600

const SLUG = 'business-of-community'
const PATH = '/courses/business-of-community'
const COURSE_NAME = 'The Business of Community 101'
const TITLE = 'The Business of Community 101: a free course'
const DESCRIPTION =
  'A free four-week course for people who already gather others. Know what a night costs you, what to charge, who came back, and who to text next week.'
const IMAGE = '/sites/new-world/photos/backyard-class.webp'
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

// A last-resort empty document so `data` is always a Data. Unreachable while the template renders.
const EMPTY: Data = { content: [], root: {} }

export default async function BusinessOfCommunityPage() {
  const page = await getPublishedPage(SLUG)
  const published = page?.doc ?? null
  const template = getTemplate(SLUG)
  const data: Data = isWellFormed(published) ? published : isWellFormed(template) ? template : EMPTY
  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Courses', path: '/courses' },
            { name: COURSE_NAME, path: PATH },
          ]),
          courseSchema({
            name: COURSE_NAME,
            description: DESCRIPTION,
            path: PATH,
            image: IMAGE,
            free: true,
            schedule: { duration: 'PT1H', repeatFrequency: 'Weekly', repeatCount: 4 },
            sameAs: BOC_JOURNEY_PATH,
          }),
        ]}
      />
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
  )
}
