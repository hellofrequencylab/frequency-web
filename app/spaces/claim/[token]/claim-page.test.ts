import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

// ── The Business Space claim landing: share card, column, copy, speed ─────────────────────
// Five owner reports, five source-text guards. Each failure mode here is SILENT — the page
// renders fine, it just previews as the wrong brand, sells something that does not ship, or
// blocks the claim button behind a content read. Nothing throws, so only a guard catches it.

const DIR = 'app/spaces/claim/[token]'
const page = readFileSync(`${DIR}/page.tsx`, 'utf8')
const ogImage = readFileSync(`${DIR}/opengraph-image.tsx`, 'utf8')
// Strip comments before asserting ABSENCE: the file documents each trap by naming it.
const pageCode = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('the share card is the business, not the site (owner: no preview in Apple Mail)', () => {
  it('authors its own openGraph instead of inheriting the root', () => {
    // 🔴 THE BUG. A static `metadata` with only title + robots inherits the ROOT layout's entire
    // openGraph block, because Next shallow-merges down the segment tree. The claim link previewed
    // as "Frequency · The Community Collective" pointing at the homepage — an inherited tag, not a
    // malformed one. A `metadata` export here means someone reverted the fix.
    expect(pageCode).toContain('export async function generateMetadata')
    expect(pageCode).not.toMatch(/export const metadata\b/)
    expect(pageCode).toContain('openGraph')
    expect(pageCode).toContain('siteName')
  })

  it('sets an explicit og:url, so the preview never points at the homepage', () => {
    expect(pageCode).toContain('url: `${SITE_URL}/spaces/claim/${token}`')
  })

  it('opts the title OUT of the root template, so the brand is not doubled', () => {
    // 🔴 app/layout.tsx declares `title.template = '%s · Frequency'`, which wraps every child title
    // that is not absolute. Both titles here already end in the site name, so a plain string renders
    // "... on Frequency · Frequency" in the browser tab AND in og:title — on the one page whose whole
    // job is to look like a real business's page. Silent: nothing throws, the tab is just wrong.
    const titles = pageCode.match(/title: \{ absolute:/g) ?? []
    expect(titles.length).toBe(2) // the named branch and the dead-token branch
    // Indent-anchored: a bare `title,` at the METADATA root (4 spaces) is the templated bug. The one
    // inside `openGraph:` (6 spaces) is correct and must stay — og:title takes no template, so the
    // shorthand there is the plain, already-branded string the share card should show.
    expect(pageCode).not.toMatch(/\n {4}title,\n/)
    expect(pageCode).toMatch(/\n {6}title,\n/)
    expect(pageCode).not.toMatch(/title: 'Claim this business',/)
  })

  it('still noindexes, because noindex and no-preview are different things', () => {
    // Messaging clients and mail previewers do not read robots directives. The card must be rich
    // AND the page must stay out of the index — dropping either is a regression.
    expect(pageCode.match(/robots: \{ index: false \}/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('names no business on a dead token', () => {
    // The neutral branch must run when the claim is missing OR already used, or a used link keeps
    // advertising the brand it no longer controls.
    expect(pageCode).toContain('claim && !claim.claimed')
  })

  it('ships a twitter-image so X does not fall back to the site card', () => {
    // Next replaces twitter.images only when the CURRENT segment supplies the file.
    expect(existsSync(`${DIR}/twitter-image.tsx`)).toBe(true)
    expect(readFileSync(`${DIR}/twitter-image.tsx`, 'utf8')).toContain("from './opengraph-image'")
  })
})

describe('the card pill is a DESIGNATOR, never a FOCUS (docs/NAMING.md)', () => {
  it('uses spaceTypeLabel and not the Mode registry label', () => {
    // The owner saw "Service business" on their own share card. That is a FOCUS (mode_variant):
    // how an operator classifies a Space internally, never a label a member or owner is shown.
    expect(ogImage).toContain('spaceTypeLabel(space.type)')
    expect(ogImage).not.toContain('resolveMode')
  })
})

describe('one column literal, not three copies (owner: the claim page is too wide)', () => {
  it('defines CLAIM_COLUMN once and uses it for ribbon, body and claim bar', () => {
    expect(pageCode).toContain('const CLAIM_COLUMN =')
    // Three consumers plus the definition.
    expect(pageCode.match(/CLAIM_COLUMN/g)?.length).toBe(4)
  })

  it('no stray max-w-6xl survives in markup', () => {
    // Three independent copies matched only by luck; the fixed bar would desync from the body the
    // first time one was edited.
    expect(pageCode).not.toContain('max-w-6xl')
  })
})

describe('the footer sells only what actually ships (docs/CONTENT-VOICE.md)', () => {
  const bar = pageCode.slice(pageCode.indexOf('Is this your business?'))

  it('does not promise payments', () => {
    // Paid booking is double-gated: a Stripe key AND host_payouts_enabled, which defaults OFF.
    // "take bookings" read as "take money for bookings" and could not be honoured.
    expect(bar).not.toContain('take bookings')
    expect(bar).not.toMatch(/get paid|take payments|start selling/i)
  })

  it('names no tier-gated or record-only surface', () => {
    // CRM / Email / Automation sit behind a Business-plan floor in FEATURE_GATES; memberships,
    // tickets and donations are record-only in v1 and would read as a revenue promise.
    for (const forbidden of ['Resonance', 'CRM', 'Email campaign', 'Automation', 'memberships', 'donations']) {
      expect(bar).not.toContain(forbidden)
    }
  })

  it('carries no em dash', () => {
    expect(bar).not.toContain('—')
  })
})

describe('the fixed claim bar reserves its own height, not a guessed one', () => {
  it('reserves space with an invisible clone, never with hand-tuned padding', () => {
    // 🔴 THE BUG. The page reserved room with `pb-48 sm:pb-28` — a guess at the bar's rendered
    // height. It was measured against the ORIGINAL footer copy and never revisited when that copy
    // grew ~50% longer, so at 375px the sell wraps to about seven lines and the bar overlapped the
    // last profile block. Nothing links the padding to the copy, so every future edit re-breaks it.
    expect(pageCode).not.toMatch(/pb-48|sm:pb-28/)
    expect(pageCode).toContain('<div aria-hidden inert className="invisible border-t border-border')
    // `invisible` (visibility:hidden) still occupies space; `hidden` (display:none) does not and
    // would reserve nothing at all while looking identical in review.
    expect(pageCode).not.toContain('aria-hidden inert className="hidden')
  })

  it('authors the bar content ONCE, so the clone cannot drift from the real bar', () => {
    // A spacer that is a hand-copy of the bar is the same staleness bug wearing different markup.
    expect(pageCode.match(/<ClaimBarContent /g)?.length).toBe(2)
    expect(pageCode.match(/function ClaimBarContent/g)?.length).toBe(1)
  })

  it('and the duplicate button is inert, so there are not two claim controls', () => {
    // Without `inert` the clone is tabbable and clickable despite being invisible: two controls
    // named "Claim this business", one of which cannot be seen.
    expect(pageCode).toContain('aria-hidden inert')
  })
})

describe('one spaces read per request, not two', () => {
  it('generateMetadata and the body share a request-cached read', () => {
    // 🔴 Next runs generateMetadata and the page in the SAME request scope. resolveSpaceClaimAny is
    // cache()d at its definition; getSpaceById is NOT, so every claim pageview paid for a second
    // full-column `spaces` select on the render path of a page whose whole job is to paint fast.
    expect(pageCode).toContain('const claimTargetSpace = cache(')
    expect(pageCode.match(/claimTargetSpace\(token\)/g)?.length).toBe(2)
    // getSpaceById may only be reached THROUGH the wrapper. A direct call is the duplication back.
    expect(pageCode.match(/getSpaceById\(/g)?.length).toBe(1)
  })

  it('wraps it locally instead of caching getSpaceById globally', () => {
    // getSpaceById has ~168 call sites, including server actions that read a Space, write it, and
    // read it again in one request (lib/importer/materialize.ts). A global cache() would hand those
    // the pre-write snapshot: a silent correctness change bought for one page's perf.
    const store = readFileSync('lib/spaces/store.ts', 'utf8')
    expect(store).toContain('export async function getSpaceById(')
    expect(store).not.toContain('export const getSpaceById = cache(')
  })
})

describe('the claim button paints before the page body (PAGE-FRAMEWORK section 5)', () => {
  it('wraps the module body in Suspense', () => {
    // SpaceProfileModules awaits getSpaceContentData. Unwrapped, the ribbon, hero and the fixed
    // claim bar all waited on it, so the one thing this page exists to show was the last to arrive.
    expect(pageCode).toContain('<Suspense fallback={<ProfileBodySkeleton />}>')
    const suspense = pageCode.indexOf('<Suspense')
    const modules = pageCode.indexOf('<SpaceProfileModules')
    expect(suspense).toBeGreaterThan(-1)
    expect(modules).toBeGreaterThan(suspense)
  })
})

describe('an owner can tell their page has unpublished changes', () => {
  const preview = readFileSync('components/spaces/owner-space-layout-preview.tsx', 'utf8')
  const grid = readFileSync('components/entity-blocks/live-profile-grid.tsx', 'utf8')
  const fab = readFileSync('components/entity-blocks/space-publish-fab.tsx', 'utf8')

  it('the draft/published comparison runs on the RAW nodes, CANONICALLY', () => {
    // parseEntityLayout normalises, so comparing PARSED nodes would report two materially different
    // arrangements as equal once they round-trip to the same shape. Hence raw.
    expect(preview).toContain('hasUnpublishedChanges')
    expect(preview).toContain('prefsObj.profileLayoutDraft')

    // But raw JSON.stringify is key-ORDER sensitive, which made the flag effectively ONE-WAY: an
    // owner who made an edit and undid it could land on a logically identical layout serialised in
    // a different key order and stay permanently "unpublished", arming a beforeunload prompt on
    // their own Space with no way to clear it but publishing a no-op.
    expect(preview).toContain('canonicalJson(prefsObj.profileLayoutDraft ?? null)')
    expect(preview).toContain('canonicalJson(prefsObj.profileLayout ?? null)')
    expect(preview).not.toContain('JSON.stringify(prefsObj.profileLayoutDraft')
    // And the helper must actually sort, or it is stringify wearing a different name.
    expect(preview).toMatch(/function canonicalJson[\s\S]{0,400}\.sort\(/)
  })

  it('the publish bar mounts OUTSIDE edit mode when there is something to publish', () => {
    // 🔴 The whole fix. Gated on `editable` alone, the only Publish affordance disappeared the
    // moment the owner closed the admin rail, and their own page looked identical to the live one.
    expect(grid).toContain('(editable || hasUnpublishedChanges) && spaceSlug')
  })

  it('and it says saved is not the same as live', () => {
    expect(fab).toContain('Saved, not yet live')
    // Voice canon applies to what a MEMBER reads, not to code comments — this file's own comments
    // use em dashes freely and should. Assert on the rendered sentence only.
    const copy = 'Saved, not yet live. Publish to show these changes to everyone.'
    expect(fab).toContain(copy)
    expect(copy).not.toContain('—')
  })
})
