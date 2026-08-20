// SEO pillar: how to calm down fast, "can't switch off," "tired but wired." The
// always-wired stress cluster (CONTENT-VOICE §7a.2). Pain-first, answer-first,
// relational register only (no medical claims, §8f).
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

const SLUG = 'calm-down-fast'
const PATH = '/calm-down-fast'
const TITLE = 'How to calm down fast when you cannot switch off'
const DESCRIPTION =
  'Wired and tired at the same time? Here is a 60-second way to calm down fast, why you cannot switch off even when you are exhausted, and how to make calm your baseline instead of your best moments.'

// Real-gathering photos double as the multimodal AIO signal (CONTENT-VOICE §8b)
// and the E-E-A-T proof (§8e). Fed into the Article schema below so answer engines
// see the page as illustrated, dated content. All three are still ON the page — the
// hero photo plus two media beats — exactly as coded.
const IMAGES = [
  '/images/site/breathwork-circle.jpg',
  '/images/site/meditation-circle-outdoor.jpg',
  '/images/site/nature-viewing-sunset.jpg',
]

// The dates the coded article published under. Kept here rather than in the document
// because they belong to the ROUTE's Article node, not to the words an operator edits.
const PUBLISHED = '2026-06-29'
const UPDATED = '2026-06-29'

// Share-card copy, shared by the OG and Twitter blocks below so the two can never drift.
const OG_TITLE = 'How to calm down fast when you cannot switch off · Frequency'
const OG_DESCRIPTION =
  'A 60-second way to calm down fast, why you stay wired even when you are exhausted, and how to make calm a habit instead of a rescue.'

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

// ONE RENDER PATH — the FIFTH seeker article to join the page editor (UX-MATURITY-PLAN Lift 5d,
// ADR-1068). The route is now metadata + schema + <BlockRender>: the words on this page live in
// lib/page-editor/templates/calm-down-fast.ts (a spec run through `articleTemplate`), and an
// operator changing them in the editor changes the page. The 296-line coded article this replaced
// is in `git log -p app/(marketing)/calm-down-fast/page.tsx`; every block of it, in order, and
// every word of it, is in that spec.
//
// THE CHAIN, and what watches each rung:
//   published doc  → an operator's published page wins.
//   code template  → templates/calm-down-fast.ts, the LAST rung and therefore load-bearing.
//                    `templates.test.ts` asserts every EDITABLE_PAGES slug has a template the
//                    CURRENT block config can render, so the fall to EMPTY below cannot happen
//                    quietly (AGENTS.md: every fail-safe needs a gate that notices).
//   EMPTY          → unreachable; present so `data` is always a Data.
//
// ⚠️ THE THREE SCHEMA NODES, and who emits each one now. This is the thing an article conversion
// is most likely to lose (LIVE-040), so it is named rather than assumed. Note the count: the
// coded page asserted NO HowTo — its Steps list was copy, not a guide — so the document's steps
// ride `steps` (BuildTimeline), which emits no node, and this page still asserts none:
//   · Article    — <BlockDocJsonLd> below. The page's own TITLE, DESCRIPTION, dates and images
//                  are passed EXPLICITLY, so the node is byte-identical to the coded
//                  `articleSchema(...)` call rather than derived from whatever the doc opens with.
//   · FAQPage    — the document's `Accordion` block, from the same six Q&A it renders.
//   · Breadcrumb — still emitted here; a block cannot know the route's place in the site.
//
// ⚠️ Do NOT add a coded section to this file. `scripts/render-path-bodies.txt` records
// `calm-down-fast 0` and `check:render-path` matches it EXACTLY. New structure on this page
// belongs in a BLOCK (lib/page-editor/config.tsx), or in the spec.
export default async function CalmDownFastPage() {
  const published = await getPublishedData(SLUG)
  const template = getTemplate(SLUG)
  const data: Data = isWellFormed(published) ? published : isWellFormed(template) ? template : EMPTY
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'Calm down fast', path: PATH }])} />
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
