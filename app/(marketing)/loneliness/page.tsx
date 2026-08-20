// SEO PILLAR (umbrella): high-functioning loneliness + third places / third space
// + life after the feed (doomscrolling). This page ABSORBS two retiring guides
// (/life-after-the-feed, /what-is-a-third-space), which 301 into it, so it lifts
// their unique content + target keywords here. Answer-first, pain-first, Seeker
// voice (CONTENT-VOICE §2a). Relational register only, no health claims.
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

const SLUG = 'loneliness'
const PATH = '/loneliness'
const TITLE = 'High-functioning loneliness: lonely but not alone'
const DESCRIPTION =
  'High-functioning loneliness is feeling alone while your life looks fine. What it is, why third places vanished, how to quit doomscrolling, and small ways back to real connection.'

// Real-gathering photos double as the multimodal AIO signal (CONTENT-VOICE §8b)
// and the E-E-A-T proof (§8e). All three are on the page (the hero photo plus two
// of the four media beats) and all three are fed to the Article node below, so
// answer engines still see the page as illustrated content.
const IMAGES = [
  '/images/site/sunset-surf.jpg',
  '/images/site/outdoor-group.jpg',
  '/images/site/PHOTO-2020-09-09-16-38-27.jpeg',
]

// The dates the coded article published under. Kept here rather than in the document
// because they belong to the ROUTE's Article node, not to the words an operator edits.
const PUBLISHED = '2026-06-24'
const UPDATED = '2026-07-24'

// Share-card copy, shared by the OG and Twitter blocks below so the two can never drift.
const OG_TITLE = 'High-functioning loneliness, explained · Frequency'
const OG_DESCRIPTION =
  'A hundred contacts and no one to call on a Tuesday. What high-functioning loneliness is, why third places got rare, how to beat the feed, and small ways back to real connection.'

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

// ONE RENDER PATH — the THIRD seeker article to join the page editor (UX-MATURITY-PLAN Lift 5d,
// ADR-1068). The route is now metadata + schema + <BlockRender>: the words on this page live in
// lib/page-editor/templates/loneliness.ts (a spec run through `articleTemplate`), and an operator
// changing them in the editor changes the page. The 500-line coded article this replaced is in
// `git log -p app/(marketing)/loneliness/page.tsx`; every block of it, in order, and every word of
// it, is in that spec.
//
// THE CHAIN, and what watches each rung:
//   published doc  → an operator's published page wins.
//   code template  → templates/loneliness.ts, the LAST rung and therefore load-bearing.
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
//   · HowTo      — the document's `DawnHowToSteps` block, built from the same three steps it
//                  renders (components/page-editor/blocks/dawn.tsx). Two deltas, deliberate and
//                  the same two as both prior enrolments: the coded node passed an explicit photo
//                  (outdoor-group) and the block derives its image from the steps' own photos
//                  (these have none, so the node falls back to the site OG image; the photo is
//                  still on the page and in the Article node); and the per-step url — the page's
//                  own URL plus the section anchor on every step — dropped. Name, description and
//                  all three steps are unchanged.
//   · FAQPage    — the document's `Accordion` block, from the same twelve Q&A it renders.
//   · Breadcrumb — still emitted here; a block cannot know the route's place in the site.
//
// ⚠️ Do NOT add a coded section to this file. `scripts/render-path-bodies.txt` records
// `loneliness 0` and `check:render-path` matches it EXACTLY. New structure on this page belongs in
// a BLOCK (lib/page-editor/config.tsx), or in the spec.
export default async function LonelinessPage() {
  const published = await getPublishedData(SLUG)
  const template = getTemplate(SLUG)
  const data: Data = isWellFormed(published) ? published : isWellFormed(template) ? template : EMPTY
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'Loneliness', path: PATH }])} />
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
