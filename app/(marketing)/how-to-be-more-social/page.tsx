// SEO PILLAR (social confidence): the authoritative page for how to be more
// social, feeling less awkward in groups, and building a social life without
// drinking. It absorbed two retired guides (feel-less-awkward-in-groups,
// social-life-without-drinking), which 301 into it. A distinct high-intent
// Seeker cluster (CONTENT-VOICE §7a). Answer-first, relational register only,
// no health claims, no personality-fixing promises.
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

const SLUG = 'how-to-be-more-social'
const PATH = '/how-to-be-more-social'
const TITLE = 'How to be more social'
const DESCRIPTION =
  'How to be more social when you keep staying home: pick one recurring thing, put it on the calendar, and go back until the room knows your name.'

// Real-gathering photos double as the multimodal AIO signal (CONTENT-VOICE §8b)
// and the E-E-A-T proof (§8e). Fed into the Article schema below so answer engines
// see the page as illustrated, dated content. All five are still ON the page — the
// hero photo plus four media beats — exactly as coded.
const IMAGES = [
  '/images/site/outdoor-group.jpg',
  '/images/site/community-1.jpg',
  '/images/site/song-circle.jpg',
  '/images/site/group-singing.jpg',
  '/images/site/community-dinner.jpg',
]

// The dates the coded article published under. Kept here rather than in the document
// because they belong to the ROUTE's Article node, not to the words an operator edits.
const PUBLISHED = '2026-06-29'
const UPDATED = '2026-07-24'

// Share-card copy, shared by the OG and Twitter blocks below so the two can never drift.
const OG_TITLE = 'How to be more social · Frequency'
const OG_DESCRIPTION =
  'You want to be more social and still end up home alone. The fix is not a new personality. Pick one recurring thing, put it on the calendar, and become a regular.'

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
    // Metadata merges per TOP-LEVEL KEY: a page that sets only `openGraph` inherits the root
    // `twitter` block verbatim, so the X/Slack card read generic site copy while the OG tags
    // were correct. Mirror the page's own share copy.
    twitter: { card: 'summary_large_image', title: OG_TITLE, description: OG_DESCRIPTION },
  }
}

// A last-resort empty document. It is NOT a design decision: it exists only so the render path is
// total (see the gate note below), and nothing should ever reach it.
const EMPTY: Data = { content: [], root: {} }

// ONE RENDER PATH — the SIXTH seeker article to join the page editor (UX-MATURITY-PLAN Lift 5d,
// ADR-1068). The route is now metadata + schema + <BlockRender>: the words on this page live in
// lib/page-editor/templates/how-to-be-more-social.ts (a spec run through `articleTemplate`), and
// an operator changing them in the editor changes the page. The 501-line coded article this
// replaced is in `git log -p app/(marketing)/how-to-be-more-social/page.tsx`; every block of it,
// in order, and every word of it, is in that spec.
//
// THE CHAIN, and what watches each rung:
//   published doc  → an operator's published page wins.
//   code template  → templates/how-to-be-more-social.ts, the LAST rung and therefore load-bearing.
//                    `templates.test.ts` asserts every EDITABLE_PAGES slug has a template the
//                    CURRENT block config can render, so the fall to EMPTY below cannot happen
//                    quietly (AGENTS.md: every fail-safe needs a gate that notices).
//   EMPTY          → unreachable; present so `data` is always a Data.
//
// ⚠️ THE FOUR SCHEMA NODES, and who emits each one now. This is the thing an article conversion
// is most likely to lose (LIVE-040), so it is named rather than assumed. The coded page asserted
// exactly ONE HowTo, and so does the document:
//   · Article    — <BlockDocJsonLd> below. The page's own TITLE, DESCRIPTION, dates and images
//                  are passed EXPLICITLY, so the node is byte-identical to the coded
//                  `articleSchema(...)` call rather than derived from whatever the doc opens with.
//   · HowTo      — the document's `DawnHowToSteps` block, from the same three steps it renders.
//   · FAQPage    — the document's `Accordion` block, from the same thirteen Q&A it renders.
//   · Breadcrumb — still emitted here; a block cannot know the route's place in the site.
//
// ⚠️ Do NOT add a coded section to this file. `scripts/render-path-bodies.txt` records
// `how-to-be-more-social 0` and `check:render-path` matches it EXACTLY. New structure on this
// page belongs in a BLOCK (lib/page-editor/config.tsx), or in the spec.
export default async function HowToBeMoreSocialPage() {
  const published = await getPublishedData(SLUG)
  const template = getTemplate(SLUG)
  const data: Data = isWellFormed(published) ? published : isWellFormed(template) ? template : EMPTY
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'How to be more social', path: PATH }])} />
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
