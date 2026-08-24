import type { Metadata } from 'next'
import type { Data } from '@/lib/page-editor/types'
import { BlockRender } from '@/lib/page-editor/block-render'
import { BlockDocJsonLd } from '@/lib/page-editor/block-seo'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'
import { getTemplate, isWellFormed } from '@/lib/page-editor/templates'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLiveData } from '@/lib/page-editor/live-data'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'What is a Circle? Community with a shape',
  description:
    'A Circle is a few people near you doing life on purpose. Frequency is a Community Collective: four Pillars and Circles that grow on their own.',
  alternates: { canonical: '/the-community' },
  openGraph: {
    title: 'The Community · Frequency',
    description:
      'Four Pillars, your Channels, and a Circle near you. Community with a shape, leaderful and built to last.',
    url: '/the-community',
  },
  // Metadata merges per TOP-LEVEL KEY: setting only `openGraph` inherits the root `twitter`
  // block verbatim, so the X/Slack card served generic site copy. Mirror this page's own.
  twitter: {
    card: 'summary_large_image',
    title: 'The Community · Frequency',
    description:
      'Four Pillars, your Channels, and a Circle near you. Community with a shape, leaderful and built to last.',
  },
}

// Article dates. Google requires datePublished/dateModified on an Article node, and every other
// pillar page stamps them as literals here; without them this URL published a dateless Article.
// Sourced from the page's own history: first shipped 2026-07-28, last revised 2026-08-05.
// They are PASSED THROUGH to BlockDocJsonLd below — a block document cannot know them, and the
// coded body that used to carry the other copy of them is gone.
const PUBLISHED = '2026-07-28'
const UPDATED = '2026-08-05'

// A last-resort empty document. It is NOT a design decision: it exists only so the render path is
// total (see the gate note below), and nothing should ever reach it.
const EMPTY: Data = { content: [], root: {} }

// ONE RENDER PATH — /the-community is template-only (UX-MATURITY-PLAN Lift 5c, ADR-1068), the
// fifth slug retired after `about`, `spaces`, `the-lab` and `the-quest`. The route is now
// metadata + server data + <BlockRender>: the words on this page live in the page editor, and an
// operator changing them changes the page. The coded `LegacyTheCommunity` body (plus its `Step` /
// `Layer` / `Hold` / `DayBeat` sub-components, the `COMMUNITY_FAQ` and `PILLARS` tables, and the
// `ProductTour` client island in ./tour, ~1,000 lines across the two files) that used to sit below
// was already UNREACHABLE — `getTemplate('the-community')` returns a static 14-block document
// whose every block names a string `type`, so `isWellFormed` is invariant, `data` could never be
// null, and the `data ? … : <LegacyTheCommunity />` branch could not be taken. Deleting it moves
// no pixels, which is a stronger guarantee than a snapshot comparison.
//
// 🔴 EVERY SCHEMA NODE SURVIVES, AND THE COUNT WAS MEASURED, NOT REASONED. /the-lab lost its
// FAQPage for weeks (LIVE-040) because its `faqSchema()` rode the legacy branch and its template
// had no Accordion, so retiring the body deleted the only source copy of markup that was already
// dead. /the-community is NOT that case:
//   • THE ROUTE NEVER EMITTED faqSchema. LIVE-040 already deleted that call as dead code and moved
//     the Q&A into the template's Accordion. The premise that this retirement had to rescue a
//     FAQPage out of the route was already expired when the row was picked up; it was re-tested
//     rather than assumed (AGENTS.md, "re-test a row's premise before you work it").
//   • The `articleSchema(...)` call deleted here sat on the LEGACY branch — the branch that could
//     never be taken — so it emitted nothing before this change and emits nothing after. The
//     Article a visitor actually gets comes from <BlockDocJsonLd>, which is unchanged.
//   • lib/page-editor/templates/the-community.ts carries an Accordion (`tc-faq`) with four of the
//     five coded Q&A, verbatim; the fifth (the cost answer) was deliberately dropped by LIVE-040
//     because it quoted the pay-what-you-want floor as a fixed Crew price, which the CREW_NOTE
//     contract forbids. `AccordionBlock` (components/page-editor/blocks/collections.tsx) renders
//     its OWN `<JsonLd data={faqSchema(...)} />` from the items it puts on screen, so the schema
//     cannot out-claim the visible page (CONTENT-VOICE §8b).
//   • MEASURED: rendering breadcrumb + <BlockDocJsonLd> + <BlockRender config={config}> over the
//     live document with renderToStaticMarkup emits THREE ld+json scripts and the node multiset
//     { BreadcrumbList 1, ListItem 1, Article 1, WebPage 1, Organization 2, ImageObject 1,
//     FAQPage 1, Question 4, Answer 4 } — identical before and after this change. NOT verified
//     against production HTML — frequencylocal.com is outside this session's egress allowlist.
//
// NOTHING RENDERED WAS LOST WITH IT, and five things were RECOVERED. Because the template was
// regenerated onto DAWN 2 in Lift 5b it is a re-expression rather than a transcript, so the coded
// page was walked section by section against it: the premise, the four Pillars, the three steps,
// the Channel/Circle mechanic, the growth loop, the Guru-free beat, the marquee, the FAQ and the
// close all have a counterpart block. Five details nothing in the template drew — the
// "No application, no audition." guardrail, the "Circulation, not exclusion." guardrail, the
// FOUNDING_PLACE grounding, and the two contextual links to /discover and /pricing — are restored
// INTO EXISTING BLOCKS in lib/page-editor/templates/the-community.ts, where that file's header
// records each one and why it landed where it did. `git log -p` on this file and on ./tour is the
// only remaining copy of the coded body.
//
// THE CROSS-LINK IS BACK (LIVE-100, 2026-08-24): the coded body closed with a <PillarNav> triptych,
// and for one day this was the only pillar page that did not link across to its two siblings while
// both of them still linked to it. It is a missing BLOCK, not a dropped sentence, so it was filed as
// a row rather than smuggled into a retirement, and then added as `tc-pillars` in the template — in
// the seat the-lab.ts and the-quest.ts already use, between the FAQ and the ink close.
//
// THE CHAIN, and what watches each rung:
//   published doc  → an operator's published page wins.
//   code template  → lib/page-editor/templates/the-community.ts, now the LAST rung and therefore
//                    load-bearing. `templates.test.ts` asserts every EDITABLE_PAGES slug has a
//                    template the CURRENT block config can render, and reads the ledger so a slug
//                    at 0 fails with "there is no coded body to fall back to" — the fall to EMPTY
//                    below cannot happen quietly (AGENTS.md: every fail-safe needs a gate that
//                    notices it fired).
//   EMPTY          → unreachable; present so `data` is always a Data.
//
// ⚠️ Do NOT add a coded section to this file. `scripts/render-path-bodies.txt` records
// `the-community 0` and `check:render-path` matches it EXACTLY, so a second top-level component
// here fails the build. New marketing structure on this page belongs in a BLOCK
// (lib/page-editor/config.tsx).
export default async function TheCommunityPage() {
  const published = await getPublishedData('the-community')
  const template = getTemplate('the-community')
  const data: Data = isWellFormed(published) ? published : isWellFormed(template) ? template : EMPTY
  const live = await getLiveData(createAdminClient()).catch(() => null)
  return (
    <>
      {/* Breadcrumb is DERIVED from the route, not from copy, so it is emitted here rather than
          by any block. Everything editorial (Article, FAQPage) travels with the document. */}
      <JsonLd data={breadcrumbSchema([{ name: 'The Community', path: '/the-community' }])} />
      <BlockDocJsonLd data={data} path="/the-community" published={PUBLISHED} updated={UPDATED} />
      <BlockRender config={config} data={data} metadata={live ? { live } : {}} />
    </>
  )
}
