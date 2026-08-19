// SEO pillar (Leader track, CONTENT-VOICE §7b.2): how to start a Circle, how to
// start a community group, how to run a recurring meetup that does not fizzle.
// The activation engine — empower the natural connector, hand them the format.
// Answer-first, relational register, no health claims.
import type { Metadata } from 'next'
import type { Data } from '@/lib/page-editor/types'
import { BlockRender } from '@/lib/page-editor/block-render'
import { BlockDocJsonLd } from '@/lib/page-editor/block-seo'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'
import { getTemplate, isWellFormed } from '@/lib/page-editor/templates'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

const SLUG = 'how-to-start-a-circle'
const PATH = '/how-to-start-a-circle'
const TITLE = 'How to start a Circle (a group that lasts)'
const DESCRIPTION =
  'How to start a Circle: pick one thing, set a standing time, invite a few people, and run the same simple format until the same faces come back.'

// Real-gathering photos double as the multimodal AIO signal (CONTENT-VOICE §8b)
// and the E-E-A-T proof (§8e). All three are on the page (the hero and the two
// media beats) and all three are fed to the Article node below, so answer engines
// still see the page as illustrated content.
const IMAGES = ['/images/site/community-1.jpg', '/images/site/mens-group.jpg', '/images/site/community-dinner.jpg']

// The dates the coded article published under. Kept here rather than in the document
// because they belong to the ROUTE's Article node, not to the words an operator edits.
const PUBLISHED = '2026-06-24'
const UPDATED = '2026-07-24'

// Share-card copy, shared by the OG and Twitter blocks below so the two can never drift.
const OG_TITLE = 'How to start a Circle · Frequency'
const OG_DESCRIPTION =
  'You do not have to build a community. Start one small Circle: one thing, a standing time, a few people, the same simple format every week.'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: PATH },
    openGraph: {
      title: OG_TITLE,
      description: OG_DESCRIPTION,
      url: PATH,
      images: [{ url: IMAGES[0] }],
    },
    // Metadata merges per TOP-LEVEL KEY: setting only `openGraph` inherits the root `twitter`
    // block verbatim, so the X/Slack card served generic site copy. Mirror this page's own.
    twitter: { card: 'summary_large_image', title: OG_TITLE, description: OG_DESCRIPTION },
  }
}

// A last-resort empty document. It is NOT a design decision: it exists only so the render path is
// total (see the gate note below), and nothing should ever reach it.
const EMPTY: Data = { content: [], root: {} }

// ONE RENDER PATH — the FIRST seeker article to join the page editor (UX-MATURITY-PLAN Lift 5d,
// ADR-1068). The route is now metadata + schema + <BlockRender>: the words on this page live in
// lib/page-editor/templates/how-to-start-a-circle.ts (a spec run through `articleTemplate`), and an
// operator changing them in the editor changes the page. The 357-line coded article this replaced
// is in `git log -p app/(marketing)/how-to-start-a-circle/page.tsx`; every block of it, in order,
// and every word of it, is in that spec.
//
// THE CHAIN, and what watches each rung:
//   published doc  → an operator's published page wins.
//   code template  → templates/how-to-start-a-circle.ts, the LAST rung and therefore load-bearing.
//                    `templates.test.ts` asserts every EDITABLE_PAGES slug has a template the
//                    CURRENT block config can render, so the fall to EMPTY below cannot happen
//                    quietly (AGENTS.md: every fail-safe needs a gate that notices).
//   EMPTY          → unreachable; present so `data` is always a Data.
//
// ⚠️ THE FOUR SCHEMA NODES, and who emits each one now. This is the thing an article conversion is
// most likely to lose (LIVE-040), so it is named rather than assumed:
//   · Article    — <BlockDocJsonLd> below. The page's own TITLE, DESCRIPTION, dates and three
//                  images are passed EXPLICITLY, so the node is byte-identical to the coded
//                  `articleSchema(...)` call rather than derived from whatever the doc opens with.
//   · HowTo      — the document's `DawnHowToSteps` block builds it from the same steps it renders
//                  (components/page-editor/blocks/dawn.tsx). One delta, deliberate: the coded call
//                  passed the three photos and a per-step url; the block derives its image from the
//                  steps' own photos, and these steps have none, so the node falls back to the site
//                  OG image. Name, description and all five steps are unchanged.
//   · FAQPage    — the document's `Accordion` block, from the same seven Q&A it renders.
//   · Breadcrumb — still emitted here; a block cannot know the route's place in the site.
//
// ⚠️ Do NOT add a coded section to this file. `scripts/render-path-bodies.txt` records
// `how-to-start-a-circle 0` and `check:render-path` matches it EXACTLY. New structure on this page
// belongs in a BLOCK (lib/page-editor/config.tsx), or in the spec.
export default async function HowToStartACirclePage() {
  const published = await getPublishedData(SLUG)
  const template = getTemplate(SLUG)
  const data: Data = isWellFormed(published) ? published : isWellFormed(template) ? template : EMPTY
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'How to start a Circle', path: PATH }])} />
      <BlockDocJsonLd
        data={data}
        path={PATH}
        title={TITLE}
        description={DESCRIPTION}
        published={PUBLISHED}
        updated={UPDATED}
        image={IMAGES}
      />
      <BlockRender config={config} data={data} />
    </>
  )
}
