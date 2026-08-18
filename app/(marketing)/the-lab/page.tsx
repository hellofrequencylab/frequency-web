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
  title: 'The Lab: a third space, planned for 2028',
  description:
    'The third space the Frequency community is building: a sauna, a cold plunge, and rooms to gather. The first is planned for 2028 in North County San Diego.',
  alternates: { canonical: '/the-lab' },
  openGraph: {
    title: 'The Lab · Frequency',
    description:
      'A vision for 2028: a sauna, a cold plunge, and rooms to gather in person. Nothing is bookable yet. The first Lab is planned for North County San Diego.',
    url: '/the-lab',
  },
  // Metadata merges per TOP-LEVEL KEY: setting only `openGraph` inherits the root `twitter`
  // block verbatim, so the X/Slack card served generic site copy. Mirror this page's own.
  twitter: {
    card: 'summary_large_image',
    title: 'The Lab · Frequency',
    description:
      'A vision for 2028: a sauna, a cold plunge, and rooms to gather in person. Nothing is bookable yet. The first Lab is planned for North County San Diego.',
  },
}

// A last-resort empty document. It is NOT a design decision: it exists only so the render path is
// total (see the gate note below), and nothing should ever reach it.
const EMPTY: Data = { content: [], root: {} }

// ONE RENDER PATH — /the-lab is template-only (UX-MATURITY-PLAN Lift 5c, ADR-1068), the third slug
// retired after `about` and `spaces`. The route is now metadata + server data + <BlockRender>: the
// words on this page live in the page editor, and an operator changing them changes the page. The
// coded `LegacyTheLab` body (Room + BuildStep, 300 lines) that used to sit below was already
// UNREACHABLE — `getTemplate('the-lab')` returns a static 7-block document (Hero, PhotoCardRow,
// BuildTimeline, Statement, PhotoTrio, PillarNav, CallToAction) whose every block names a string
// `type`, so `isWellFormed` is invariant, `data` could never be null, and the
// `data ? … : <LegacyTheLab />` branch could not be taken. Deleting it moves no pixels, which is a
// stronger guarantee than a snapshot comparison.
//
// NOTHING RENDERED WAS LOST WITH IT. Every section the coded body drew is in the template, section
// for section and word for word, including the two details that read as hand-tuned: the
// "Reference, not our room" overline on the concept photography (`PhotoCardRow.tag`) and the amber
// rule above the no-rates footnote (`BuildTimelineBlock` draws it whenever `footnote` is set).
// The ONE thing that did not survive was never rendered by either rung: a five-entry `THE_LAB_FAQ`
// whose `faqSchema()` sat on the legacy branch, so it has emitted no FAQPage since the template
// landed — and the block document contains no Accordion, so there is no visible copy it could
// honestly describe (CONTENT-VOICE §8b: schema must not out-claim the page). Reinstating it means
// adding an Accordion to lib/page-editor/templates/the-lab.ts, which is a content decision that
// moves pixels, not part of this deletion. `git log -p` on this file is the only remaining copy.
//
// THE CHAIN, and what watches each rung:
//   published doc  → an operator's published page wins.
//   code template  → lib/page-editor/templates/the-lab.ts, now the LAST rung and therefore
//                    load-bearing. `templates.test.ts` asserts every EDITABLE_PAGES slug has a
//                    template the CURRENT block config can render, and reads the ledger so a slug
//                    at 0 fails with "there is no coded body to fall back to" — the fall to EMPTY
//                    below cannot happen quietly (AGENTS.md: every fail-safe needs a gate that
//                    notices it fired).
//   EMPTY          → unreachable; present so `data` is always a Data.
//
// ⚠️ Do NOT add a coded section to this file. `scripts/render-path-bodies.txt` records `the-lab 0`
// and `check:render-path` matches it EXACTLY, so a second top-level component here fails the build.
// New marketing structure on this page belongs in a BLOCK (lib/page-editor/config.tsx).
export default async function TheLabPage() {
  const published = await getPublishedData('the-lab')
  const template = getTemplate('the-lab')
  const data: Data = isWellFormed(published) ? published : isWellFormed(template) ? template : EMPTY
  const live = await getLiveData(createAdminClient()).catch(() => null)
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'The Lab', path: '/the-lab' }])} />
      <BlockDocJsonLd data={data} path="/the-lab" />
      <BlockRender config={config} data={data} metadata={live ? { live } : {}} />
    </>
  )
}
