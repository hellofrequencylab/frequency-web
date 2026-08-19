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
  title: 'How does The Quest work? Zaps, Gems, Journeys',
  description:
    'The Quest is a light game where showing up counts. Earn Zaps in person and Gems online, finish three Journeys a season, and climb the ranks.',
  alternates: { canonical: '/the-quest' },
  openGraph: {
    title: 'The Quest · Frequency',
    description:
      'Real life is the reward. Zaps, Gems, season ranks, and Journeys: a path that rewards showing up, not scrolling.',
    url: '/the-quest',
  },
  // Metadata merges per TOP-LEVEL KEY: setting only `openGraph` inherits the root `twitter`
  // block verbatim, so the X/Slack card served generic site copy. Mirror this page's own.
  twitter: {
    card: 'summary_large_image',
    title: 'The Quest · Frequency',
    description:
      'Real life is the reward. Zaps, Gems, season ranks, and Journeys: a path that rewards showing up, not scrolling.',
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

// ONE RENDER PATH — /the-quest is template-only (UX-MATURITY-PLAN Lift 5c, ADR-1068), the fourth
// slug retired after `about`, `spaces` and `the-lab`. The route is now metadata + server data +
// <BlockRender>: the words on this page live in the page editor, and an operator changing them
// changes the page. The coded `LegacyTheQuest` body (plus its `Guard` sub-component and the
// `RANKS` / `QUEST_FAQ` tables, ~370 lines) that used to sit below was already UNREACHABLE —
// `getTemplate('the-quest')` returns a static 18-block document whose every block names a string
// `type`, so `isWellFormed` is invariant, `data` could never be null, and the
// `data ? … : <LegacyTheQuest />` branch could not be taken. Deleting it moves no pixels, which is
// a stronger guarantee than a snapshot comparison.
//
// 🔴 THE FAQPage SURVIVES, AND THIS IS THE POINT THE PREVIOUS RETIREMENT GOT WRONG. /the-lab lost
// its FAQPage for weeks (LIVE-040) because its `faqSchema()` rode the legacy branch and its
// template had no Accordion, so retiring the body deleted the only source copy of markup that was
// already dead. /the-quest is NOT that case, and it was checked rather than assumed:
//   • The `faqSchema(QUEST_FAQ…)` call deleted here sat on the LEGACY branch — the branch that
//     could never be taken — so it emitted nothing before this change and emits nothing after.
//   • lib/page-editor/templates/the-quest.ts carries an Accordion (`tq-faq`) whose five Q&A were
//     verified byte-identical to the deleted QUEST_FAQ, question and answer.
//   • `AccordionBlock` (components/page-editor/blocks/collections.tsx) renders its OWN
//     `<JsonLd data={faqSchema(...)} />` from those items, built from the same strings it puts on
//     screen, so the schema cannot out-claim the visible page (CONTENT-VOICE §8b).
//   • Proven, not reasoned: rendering the template's Accordion through
//     `<BlockRender config={config}>` with renderToStaticMarkup emits one "@type":"FAQPage" and
//     five "@type":"Question" nodes. NOT verified against production HTML — frequencylocal.com is
//     outside this session's egress allowlist.
//
// NOTHING RENDERED WAS LOST WITH IT, and three things were RECOVERED. The template was regenerated
// onto DAWN 2 in Lift 5b, so it is a re-expression of the coded page rather than a transcript: the
// premise, the two currencies, the season shape, the ranks and their tags, the marquee, the
// triptych and the close all have a counterpart block, and the coded ink "Membership turns on the
// Quest" beat survives verbatim inside FAQ answer 5. Walking it section by section turned up three
// details nothing in the template drew — the "Generosity over grinding" guardrail and the two
// contextual links to /discover and /pricing — and they are restored INTO EXISTING BLOCKS in
// lib/page-editor/templates/the-quest.ts, where that file's header records each one and why it
// landed where it did. Two coded phrasings were deliberately NOT restored because the template
// says the same thing in its own words: "Real life is the reward." (now the StoryBeats title "The
// point is the life, not the score.", and still this page's OG/Twitter description above) and the
// "Season one is open" trophy line (now the mid-page CallToAction). `git log -p` on this file is
// the only remaining copy of the coded body.
//
// THE CHAIN, and what watches each rung:
//   published doc  → an operator's published page wins.
//   code template  → lib/page-editor/templates/the-quest.ts, now the LAST rung and therefore
//                    load-bearing. `templates.test.ts` asserts every EDITABLE_PAGES slug has a
//                    template the CURRENT block config can render, and reads the ledger so a slug
//                    at 0 fails with "there is no coded body to fall back to" — the fall to EMPTY
//                    below cannot happen quietly (AGENTS.md: every fail-safe needs a gate that
//                    notices it fired).
//   EMPTY          → unreachable; present so `data` is always a Data.
//
// ⚠️ Do NOT add a coded section to this file. `scripts/render-path-bodies.txt` records
// `the-quest 0` and `check:render-path` matches it EXACTLY, so a second top-level component here
// fails the build. New marketing structure on this page belongs in a BLOCK
// (lib/page-editor/config.tsx).
export default async function TheQuestPage() {
  const published = await getPublishedData('the-quest')
  const template = getTemplate('the-quest')
  const data: Data = isWellFormed(published) ? published : isWellFormed(template) ? template : EMPTY
  const live = await getLiveData(createAdminClient()).catch(() => null)
  return (
    <>
      {/* Breadcrumb is DERIVED from the route, not from copy, so it is emitted here rather than
          by any block. Everything editorial (Article, FAQPage) travels with the document. */}
      <JsonLd data={breadcrumbSchema([{ name: 'The Quest', path: '/the-quest' }])} />
      <BlockDocJsonLd data={data} path="/the-quest" published={PUBLISHED} updated={UPDATED} />
      <BlockRender config={config} data={data} metadata={live ? { live } : {}} />
    </>
  )
}
