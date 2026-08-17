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

export function generateMetadata(): Metadata {
  return {
    title: 'About',
    // Capped under the ~155 char search-snippet window, the same rule
    // /discover/circles/[id] already applies. This ran 326 characters, so
    // everything after "where they live" was cut by the SERP and the money
    // model was being written to an audience that never saw it. That paragraph
    // lives on the page and on /pricing, where a reader can actually read it.
    description:
      'The story behind Frequency, born on a cliff at Moonlight Beach in 2020. We hand ordinary people the tools to rebuild the third place where they live.',
    alternates: { canonical: '/about' },
    openGraph: {
      title: 'About Frequency',
      description: 'The third place is gone. We hand ordinary people the tools to bring it back.',
      url: '/about',
    },
    // Metadata merges per TOP-LEVEL KEY, so a page that sets only `openGraph` inherits the ROOT
    // `twitter` block verbatim and posts the generic site card. Mirror the page's own OG values.
    twitter: {
      card: 'summary_large_image',
      title: 'About Frequency',
      description: 'The third place is gone. We hand ordinary people the tools to bring it back.',
    },
  }
}

// A last-resort empty document. It is NOT a design decision: it exists only so the render path is
// total (see the gate note below), and nothing should ever reach it.
const EMPTY: Data = { content: [], root: {} }

// ONE RENDER PATH — /about is template-only (UX-MATURITY-PLAN Lift 5c, ADR-1068). The route is now
// metadata + server data + <BlockRender>: the words on this page live in the page editor, and an
// operator changing them changes the page. The coded `LegacyAbout` body (STORY_BEATS + Value + Ask,
// 250 lines) that used to sit below was already UNREACHABLE — `getTemplate('about')` always returns
// a well-formed document, so the `data ? … : <LegacyAbout />` branch could not be taken — which is
// why `about` was the safe first retirement: deleting it moves no pixels.
//
// THE CHAIN, and what watches each rung:
//   published doc  → an operator's published page wins.
//   code template  → lib/page-editor/templates/about.ts, now the LAST rung and therefore
//                    load-bearing. `templates.test.ts` asserts every EDITABLE_PAGES slug has a
//                    template the CURRENT block config can render, so the fall to EMPTY below
//                    cannot happen quietly (AGENTS.md: every fail-safe needs a gate that notices).
//   EMPTY          → unreachable; present so `data` is always a Data.
//
// ⚠️ Do NOT add a coded section to this file. `scripts/render-path-bodies.txt` records `about 0`
// and `check:render-path` matches it EXACTLY, so a second top-level component here fails the build.
// New marketing structure on this page belongs in a BLOCK (lib/page-editor/config.tsx).
export default async function AboutPage() {
  const published = await getPublishedData('about')
  const template = getTemplate('about')
  const data: Data = isWellFormed(published) ? published : isWellFormed(template) ? template : EMPTY
  const live = await getLiveData(createAdminClient()).catch(() => null)
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'About', path: '/about' }])} />
      <BlockDocJsonLd data={data} path="/about" />
      <BlockRender config={config} data={data} metadata={live ? { live } : {}} />
    </>
  )
}
