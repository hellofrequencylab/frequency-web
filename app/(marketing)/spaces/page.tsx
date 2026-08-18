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
  title: 'Spaces',
  description:
    'Run your community as a Space on Frequency. A front door in Discover, and the tools to host Circles and Runs. Free to start, no card today.',
  alternates: { canonical: '/spaces' },
  openGraph: {
    title: 'Spaces · Frequency',
    description:
      'Bring your community onto Frequency as a Space: a real front door, the format for Circles and Runs, and tools to grow without losing what made it yours.',
    url: '/spaces',
  },
  // Metadata merges per TOP-LEVEL KEY: setting only `openGraph` inherits the root `twitter`
  // block verbatim, so the X/Slack card served generic site copy. Mirror this page's own.
  twitter: {
    card: 'summary_large_image',
    title: 'Spaces · Frequency',
    description:
      'Bring your community onto Frequency as a Space: a real front door, the format for Circles and Runs, and tools to grow without losing what made it yours.',
  },
}

// A last-resort empty document. It is NOT a design decision: it exists only so the render path is
// total (see the gate note below), and nothing should ever reach it.
const EMPTY: Data = { content: [], root: {} }

// ONE RENDER PATH — /spaces is template-only (UX-MATURITY-PLAN Lift 5c, ADR-1068), the second slug
// retired after `about`. The route is now metadata + server data + <BlockRender>: the words on this
// page live in the page editor, and an operator changing them changes the page. The coded
// `LegacySpaces` body (INSIDE + GuideLink, 210 lines) that used to sit below was already
// UNREACHABLE — `getTemplate('spaces')` returns a static 18-block document that is always
// well-formed, so the `data ? … : <LegacySpaces />` branch could not be taken. Deleting it moves no
// pixels, which is a stronger guarantee than a snapshot comparison.
//
// NOTHING WAS LOST WITH IT. The two sections the coded body carried and the live page had dropped
// were RECOVERED into lib/page-editor/templates/spaces.ts in Lift 5b: the six-item "what a Space
// gets" band, and the "guides for builders" cross-links that keep /spaces the hub of the Labs-track
// internal-link graph (the template also fixes the coded body's duplicate href, which pointed two
// of the four cards at the same guide).
//
// THE CHAIN, and what watches each rung:
//   published doc  → an operator's published page wins.
//   code template  → lib/page-editor/templates/spaces.ts, now the LAST rung and therefore
//                    load-bearing. `templates.test.ts` asserts every EDITABLE_PAGES slug has a
//                    template the CURRENT block config can render, and reads the ledger so a slug
//                    at 0 fails with "there is no coded body to fall back to" — the fall to EMPTY
//                    below cannot happen quietly (AGENTS.md: every fail-safe needs a gate that
//                    notices it fired).
//   EMPTY          → unreachable; present so `data` is always a Data.
//
// ⚠️ Do NOT add a coded section to this file. `scripts/render-path-bodies.txt` records `spaces 0`
// and `check:render-path` matches it EXACTLY, so a second top-level component here fails the build.
// New marketing structure on this page belongs in a BLOCK (lib/page-editor/config.tsx).
export default async function SpacesPage() {
  const published = await getPublishedData('spaces')
  const template = getTemplate('spaces')
  const data: Data = isWellFormed(published) ? published : isWellFormed(template) ? template : EMPTY
  const live = await getLiveData(createAdminClient()).catch(() => null)
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'Spaces', path: '/spaces' }])} />
      {/* The coded body published NO Article schema, so this rung is the only one that ever has.
          Unconditional now, which is what it already was in practice: `data` was never null. */}
      <BlockDocJsonLd data={data} path="/spaces" />
      <BlockRender config={config} data={data} metadata={live ? { live } : {}} />
    </>
  )
}
