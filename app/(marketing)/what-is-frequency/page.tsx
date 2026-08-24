// Core story page: "What is Frequency?" — the answer-first explainer of the
// movement and vision. Distinct from /about (the founding NARRATIVE): this page
// directly answers the question "what is Frequency?" in the first two sentences,
// then resolves the follow-on questions a newcomer actually asks. Answer-first,
// on-brand, Article + FAQ schema for AEO/AIO eligibility (CONTENT-VOICE §8).
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

const SLUG = 'what-is-frequency'
const PATH = '/what-is-frequency'
const TITLE = 'What is Frequency and how does it work?'
// META_DESCRIPTION is trimmed to ~155 chars for the SERP snippet and carries the
// primary keywords. The longer DESCRIPTION feeds the Article schema, where length
// is not penalized and the fuller Community Collective framing aids AIO citation.
const META_DESCRIPTION =
  'Frequency is a Community Collective: small local Circles, nearby Events, and a real space to gather. What it is, how it works, and what it costs.'
const DESCRIPTION =
  'Frequency is a Community Collective: small local Circles, nearby Events, and a real space to gather, plus the tools creators and businesses need to grow together. You keep 100% of your own bookings. Here is what it is, how it works, and what it costs.'

// The hero photo, fed to the Article schema for richer-result eligibility. The coded
// page passed this ONE image (the closing media beat's photo was never in the node),
// so it is still the only image the Article carries.
const HERO_IMAGE = '/images/site/community-1.jpg'

// The dates the coded article published under. Kept here rather than in the document
// because they belong to the ROUTE's Article node, not to the words an operator edits.
const PUBLISHED = '2026-06-29'
const UPDATED = '2026-07-24'

// Share-card copy, shared by the OG and Twitter blocks below so the two can never drift.
const OG_TITLE = 'What is Frequency and how does it work? · Frequency'
const OG_DESCRIPTION =
  'Frequency is a Community Collective: small local Circles, nearby Events, a real space to gather, and the tools to grow together. What it is, how it works, and what it costs.'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: META_DESCRIPTION,
    alternates: { canonical: PATH },
    openGraph: {
      title: OG_TITLE,
      description: OG_DESCRIPTION,
      url: PATH,
    },
    // Metadata merges per TOP-LEVEL KEY: setting only `openGraph` inherits the root `twitter`
    // block verbatim, so the X/Slack card served generic site copy. Mirror this page's own.
    twitter: { card: 'summary_large_image', title: OG_TITLE, description: OG_DESCRIPTION },
  }
}

// A last-resort empty document. It is NOT a design decision: it exists only so the render path is
// total (see the gate note below), and nothing should ever reach it.
const EMPTY: Data = { content: [], root: {} }

// ONE RENDER PATH — the EIGHTH and LAST seeker article to join the page editor
// (UX-MATURITY-PLAN Lift 5d, ADR-1068). The route is now metadata + schema + <BlockRender>: the
// words on this page live in lib/page-editor/templates/what-is-frequency.ts (a spec run through
// `articleTemplate`), and an operator changing them in the editor changes the page. The 517-line
// coded article this replaced is in `git log -p app/(marketing)/what-is-frequency/page.tsx`; every
// block of it, in order, and every word of it, is in that spec.
//
// ⚠️ THE PRICE FIGURES DID NOT MOVE INTO A DOCUMENT AS TEXT. The tier ladder and the money
// answers in the FAQ still interpolate from the ONE price source (lib/pricing/*) — the spec is
// code, so it re-derives on every build exactly as this route did. See the header of the spec for
// the one case that CAN freeze them (an operator publishing the document).
//
// THE CHAIN, and what watches each rung:
//   published doc  → an operator's published page wins.
//   code template  → templates/what-is-frequency.ts, the LAST rung and therefore load-bearing.
//                    `templates.test.ts` asserts every EDITABLE_PAGES slug has a template the
//                    CURRENT block config can render, so the fall to EMPTY below cannot happen
//                    quietly (AGENTS.md: every fail-safe needs a gate that notices).
//   EMPTY          → unreachable; present so `data` is always a Data.
//
// ⚠️ THE FOUR SCHEMA NODES, and who emits each one now. This is the thing an article conversion
// is most likely to lose (LIVE-040), so it is named rather than assumed. The coded page asserted
// exactly ONE HowTo, and so does the document:
//   · Article    — <BlockDocJsonLd> below. The page's own TITLE, the LONG DESCRIPTION (not the
//                  trimmed META_DESCRIPTION), the dates and the hero image are passed EXPLICITLY,
//                  so the node is byte-identical to the coded `articleSchema(...)` call rather
//                  than derived from whatever the doc opens with.
//   · HowTo      — the document's `DawnHowToSteps` block, from the same three steps it renders.
//   · FAQPage    — the document's `Accordion` block, from the same twelve Q&A it renders.
//   · Breadcrumb — still emitted here; a block cannot know the route's place in the site.
//
// ⚠️ Do NOT add a coded section to this file. `scripts/render-path-bodies.txt` records
// `what-is-frequency 0` and `check:render-path` matches it EXACTLY. New structure on this page
// belongs in a BLOCK (lib/page-editor/config.tsx), or in the spec.
export default async function WhatIsFrequencyPage() {
  const published = await getPublishedData(SLUG)
  const template = getTemplate(SLUG)
  const data: Data = isWellFormed(published) ? published : isWellFormed(template) ? template : EMPTY
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'What is Frequency', path: PATH }])} />
      <BlockDocJsonLd
        data={data}
        path={PATH}
        title={TITLE}
        description={DESCRIPTION}
        published={PUBLISHED}
        updated={UPDATED}
        image={HERO_IMAGE}
      />
      <BlockRender config={config} data={data} />
    </>
  )
}
