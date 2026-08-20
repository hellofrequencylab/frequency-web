// SEO PILLAR (Seeker track, CONTENT-VOICE §7a): the making-friends hub. Absorbs
// the retired thin guides (meet-people-new-city, find-like-minded-people,
// how-to-reconnect-with-old-friends) so all their ranking equity and coverage
// consolidate here: how to make friends as an adult, why it is hard after 30,
// meeting people in a new city, finding like-minded people, and reconnecting with
// old friends. Pain-first, answer-first, relational register only, no health
// claims. This page is a HUB: it links forward to /discover and the sibling
// pillars, and hands off to the leader track for the reader who wants to start
// the room themselves.
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

const SLUG = 'friendship-as-an-adult'
const PATH = '/friendship-as-an-adult'
const TITLE = 'How to make friends as an adult'
// Meta description carries the primary keyword and stays under ~155 chars.
const DESCRIPTION =
  'How to make friends as an adult: the built-in ways to meet people vanish after 30. Pick one thing that meets on a rhythm, and go back more than once.'

// Real-gathering photos double as the multimodal AIO signal (CONTENT-VOICE §8b)
// and the E-E-A-T proof (§8e): images of real Frequency gatherings. These five are
// the coded Article node's exact list, unchanged: four of them are on the page (the
// hero photo plus three media beats), and community-dinner rode the coded node
// without being rendered — it still does. The page also renders a fifth photo
// (outdoor-group) the coded node never listed, exactly as before.
const IMAGES = [
  '/images/site/63978107-8b40-4ce2-8eaf-01a2f6f35cb9.jpg',
  '/images/site/PHOTO-2020-10-07-14-38-02.jpeg',
  '/images/site/36d99363-e483-40a0-b173-7e7ee6c1b379.jpg',
  '/images/site/song-circle.jpg',
  '/images/site/community-dinner.jpg',
]

// The dates the coded article published under. Kept here rather than in the document
// because they belong to the ROUTE's Article node, not to the words an operator edits.
const PUBLISHED = '2026-06-24'
const UPDATED = '2026-07-24'

// Share-card copy, shared by the OG and Twitter blocks below so the two can never drift.
const OG_TITLE = 'How to make friends as an adult · Frequency'
const OG_DESCRIPTION =
  'Why friendship gets harder after 30, plus how to meet people in a new city, find like-minded people, and reconnect with old friends. One repeatable move: the same room, more than once.'

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

// ONE RENDER PATH — the FOURTH seeker article to join the page editor (UX-MATURITY-PLAN Lift 5d,
// ADR-1068). The route is now metadata + schema + <BlockRender>: the words on this page live in
// lib/page-editor/templates/friendship-as-an-adult.ts (a spec run through `articleTemplate`), and
// an operator changing them in the editor changes the page. The 532-line coded article this
// replaced is in `git log -p app/(marketing)/friendship-as-an-adult/page.tsx`; every block of it,
// in order, and every word of it, is in that spec.
//
// THE CHAIN, and what watches each rung:
//   published doc  → an operator's published page wins.
//   code template  → templates/friendship-as-an-adult.ts, the LAST rung and therefore
//                    load-bearing. `templates.test.ts` asserts every EDITABLE_PAGES slug has a
//                    template the CURRENT block config can render, so the fall to EMPTY below
//                    cannot happen quietly (AGENTS.md: every fail-safe needs a gate that notices).
//   EMPTY          → unreachable; present so `data` is always a Data.
//
// ⚠️ THE FOUR SCHEMA NODES, and who emits each one now. This is the thing an article conversion is
// most likely to lose (LIVE-040), so it is named rather than assumed:
//   · Article    — <BlockDocJsonLd> below. The page's own TITLE, DESCRIPTION, dates and images
//                  are passed EXPLICITLY, so the node is byte-identical to the coded
//                  `articleSchema(...)` call rather than derived from whatever the doc opens with.
//   · HowTo      — the document's `DawnHowToSteps` block (the reconnect track), built from the
//                  same five steps it renders (components/page-editor/blocks/dawn.tsx). The coded
//                  page asserted exactly ONE HowTo and so does the document: its other two step
//                  lists are `steps` (BuildTimeline), which emits no node. Two deltas, deliberate
//                  and the same two as every prior enrolment: the coded node passed explicit
//                  photos (community-dinner + the hero) and the block derives its image from the
//                  steps' own photos (these have none, so the node falls back to the site OG
//                  image; both photos are still in the Article node); and the per-step url — the
//                  page's own URL on every step — dropped. Name, description and all five steps
//                  are unchanged.
//   · FAQPage    — the document's `Accordion` block, from the same eleven Q&A it renders.
//   · Breadcrumb — still emitted here; a block cannot know the route's place in the site.
//
// ⚠️ Do NOT add a coded section to this file. `scripts/render-path-bodies.txt` records
// `friendship-as-an-adult 0` and `check:render-path` matches it EXACTLY. New structure on this
// page belongs in a BLOCK (lib/page-editor/config.tsx), or in the spec.
export default async function FriendshipPage() {
  const published = await getPublishedData(SLUG)
  const template = getTemplate(SLUG)
  const data: Data = isWellFormed(published) ? published : isWellFormed(template) ? template : EMPTY
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'Adult friendship', path: PATH }])} />
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
