import type { Metadata } from 'next'
import type { Data } from '@/lib/page-editor/types'
import { BlockRender } from '@/lib/page-editor/block-render'
import { BlockDocJsonLd } from '@/lib/page-editor/block-seo'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'
import { getTemplate, isWellFormed } from '@/lib/page-editor/templates'
import { createClient } from '@/lib/supabase/server'
import { MarketingHeader } from '@/components/layout/marketing-header'
import { MarketingFooter } from '@/components/layout/marketing-footer'
import { getMenu, getMenuSettings } from '@/lib/menus/read'
import { resolvePageContent } from '@/lib/page-content'
import { SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from '@/lib/site'

// SEO title + description are operator-editable through the ADR-180 page-content
// system (edited at /pages/home; the coded strings below are the fallback).
export async function generateMetadata(): Promise<Metadata> {
  const { title, description } = await resolvePageContent('/', {
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  })
  return {
    // `absolute` opts out of the root "%s · Frequency" template (the home title
    // already carries the brand).
    title: { absolute: title },
    description,
    alternates: { canonical: '/' },
    openGraph: { title, description, url: '/' },
    // Metadata merges per TOP-LEVEL KEY, so a page that sets only `openGraph` inherits the ROOT
    // `twitter` block verbatim — which meant the operator-edited home title/description never
    // reached the X/Slack card. Mirror the OG values so both cards read the same live copy.
    twitter: { card: 'summary_large_image', title, description },
  }
}

// A last-resort empty document. It is NOT a design decision: it exists only so the render path is
// total (see the chain below), and nothing should ever reach it.
const EMPTY: Data = { content: [], root: {} }

// ONE RENDER PATH — `/` is template-only (UX-MATURITY-PLAN Lift 5c, ADR-1068), the sixth and last
// slug of the series after `about`, `spaces`, `the-lab`, `the-quest` and `the-community`. The route
// is now metadata + chrome + <BlockRender>: the words on the home page live in the page editor, and
// an operator changing them changes the site's front door. The coded `Splash` body (plus its
// `LiveProof` / `LiveProofSkeleton` / `PostPreviewCard` / `EventRow` sub-components, the
// `HOME_ROLES` and `HOME_FAQ` tables, and the interpolated pricing constants, ~810 lines) that used
// to sit below was already UNREACHABLE, and here it was doubly so:
//   • `getPublishedData('home')` returns an owner-PUBLISHED 13-block document (published
//     2026-07-13). Every one of its 13 blocks names a string `type`, so `isWellFormed(published)`
//     is true and the FIRST rung already wins.
//   • `getTemplate('home')` is a static 13-block document whose every block also names a string
//     `type`, so the second rung is well-formed too, and templates.test.ts asserts it renders under
//     the current config.
// `data` therefore could never be null and the `data ? … : <Splash />` branch could not be taken.
// Deleting it moves no pixels — a stronger guarantee than a snapshot comparison, and the reason no
// visual baseline was recaptured for this change.
//
// 🔴 lib/page-editor/templates/home.ts IS UNREACHABLE BY DECISION, NOT BY ACCIDENT — do not "fix"
// it. The owner ruled on 2026-08-24 that the PUBLISHED document is the source of truth for `/`.
// The code template is the fallback rung beneath it and, while a published document exists, nothing
// in it is ever rendered. So: do NOT recover copy into home.ts, and do NOT reconcile it against the
// published page. Change the home page in the EDITOR. (The file stays because it is the seed for a
// fresh editor session and the safety rung if the published document is ever unpublished — see
// templates.test.ts, which fails loudly if it stops resolving.)
//
// 🔴 EVERY SCHEMA NODE SURVIVES, AND THE COUNT WAS MEASURED, NOT REASONED. /the-lab lost its
// FAQPage for weeks (LIVE-040) because a `faqSchema()` call rode a legacy branch that never
// rendered. This route carried the same shape — `faqSchema(HOME_FAQ)` sat INSIDE `Splash` — so it
// is worth being blunt: `/` HAS EMITTED NO FAQPage SINCE THE `home` TEMPLATE LANDED, and deleting
// HOME_FAQ neither caused that nor cured it. MEASURED with renderToStaticMarkup over
// `<BlockDocJsonLd data={data} path="/" />` + `<BlockRender config={config} data={data} />`, the
// exact pair this route renders (no breadcrumb — this IS the root, and an empty BreadcrumbList is
// worse than none; no metadata overrides passed):
//   · the PUBLISHED document → 1 ld+json script, { Article 1, WebPage 1, Organization 2,
//     ImageObject 1 }
//   · getTemplate('home')    → 1 ld+json script, { Article 1, WebPage 1, Organization 2,
//     ImageObject 1 }
// Byte-identical before and after this change, on both rungs. NOT verified against production HTML
// — frequencylocal.com is outside this session's egress allowlist.
//
// NOTHING RENDERED WAS LOST, and nothing was recovered, BY DESIGN. The five retirements before this
// one walked the coded body section by section and moved anything the template did not draw into
// the template. That step is deliberately absent here: the published document — not home.ts — is
// what a visitor sees, and recovering copy into home.ts would be writing into a file no reader ever
// reaches. Anything the owner wants from the old splash belongs in the EDITOR. `git log -p` on this
// file is the only remaining copy of the coded body.
//
// THE CHAIN, and what watches each rung:
//   published doc  → the owner's published 13-block page. WINS TODAY, and by decision.
//   code template  → lib/page-editor/templates/home.ts. Unreachable while the above exists;
//                    `templates.test.ts` still asserts it resolves and renders, so the fall to
//                    EMPTY cannot happen quietly (AGENTS.md: every fail-safe needs a gate that
//                    notices it fired).
//   EMPTY          → unreachable; present so `data` is always a Data.
//
// The home page renders its OWN header/footer: it sits over a dark hero, OUTSIDE the (marketing)
// layout group, so the chrome is wrapped around <BlockRender> here rather than inherited. Live
// counts stay OFF (no `metadata={{ live }}`): the home document carries the honest, qualitative
// founding framing, never invented numbers.
//
// ⚠️ Do NOT add a coded section to this file. `scripts/render-path-bodies.txt` records `home 0` and
// `check:render-path` matches it EXACTLY, so a second top-level component here fails the build. New
// marketing structure on this page belongs in a BLOCK (lib/page-editor/config.tsx).
export default async function RootPage() {
  // Home ("/") is the marketing front door for a VISITOR. A signed-in member never reaches this
  // component: proxy.ts redirects `/` to /feed for them (owner directive, 2026-09-01 — it reverses
  // the previous "marketing for everyone" rule this comment used to state), and the redirect runs
  // before the route is entered so the document below is never rendered for a member.
  //
  // We still read `user`, and it is not dead: `/?preview` is the page editor's "View home" door
  // (app/(main)/pages/home/page.tsx) and the ONE way a signed-in operator gets here. On that path
  // the header must render the member's chrome — logo into /feed, no "Sign in" — rather than
  // telling the operator who just edited the page that they are a stranger to it.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // DB-backed nav megas for the header (lib/menus); fall back to code defaults on any miss, so
  // safe pre-migration.
  const [headerMenu, footerMenu, menuTimings] = await Promise.all([
    getMenu('header'),
    getMenu('footer'),
    getMenuSettings(),
  ])

  const published = await getPublishedData('home')
  const template = getTemplate('home')
  const data: Data = isWellFormed(published) ? published : isWellFormed(template) ? template : EMPTY

  return (
    <>
      {/* The Article comes from the rendered document via BlockDocJsonLd. No breadcrumb: this IS
          the root, so the list would be empty. No FAQPage: the home document carries no Accordion,
          and asserting answers no visitor can read is what /pricing:309-313 forbids. */}
      <BlockDocJsonLd data={data} path="/" />
      <MarketingHeader overHero isAuth={!!user} headerMenu={headerMenu} menuTimings={menuTimings} ctaLabel="Join the beta" />
      <main id="main">
        <BlockRender config={config} data={data} />
      </main>
      <MarketingFooter menu={footerMenu} />
    </>
  )
}
