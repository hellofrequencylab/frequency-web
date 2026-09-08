import 'server-only'

import { getPageHeaderImage, getPageHeaderFocus } from '@/lib/page-settings/store'
import { resolveHeaderElement } from '@/lib/elements/header'
import { longestPrefixRow, resolveContentCascade } from '@/lib/layout/content-cascade'
import type { HeaderSize } from '@/lib/layout/header-sizes'
import type { PageHeroVariant } from '@/components/templates/page-hero'

// INDEX HERO — the ONE resolver for a browse page's overlay hero band (PROG-P4, PAGE-FRAMEWORK §8.5).
//
// `IndexTemplate`'s `heroOverlay` branch has been shipped and proven since #1639; what was missing
// was a place to put the SIX LINES every adopter re-typed to feed it. Three pages (/practices,
// /journeys, /library) each carried a near-identical stanza — read the operator's Settings header
// image, fall back to the older page-content hero, fall back again to a hardcoded section cover,
// read the focal point only when the operator's own image won, then resolve the header element for
// layout/height/scrim. Nothing held the route -> default-cover mapping, so each new adopter invented
// its own. That is the shape that becomes 27 copies; this module is the one copy.
//
// Call it, spread it:
//
//   const hero = await resolveIndexHero('/network/friends')
//   return <IndexTemplate {...hero} title="Friends" … />
//
// SERVER-ONLY (it reads page_settings + element_settings through service-role clients) and
// FAIL-SAFE: every read it makes already resolves to null / the registry defaults on any error, and
// the whole resolve is additionally wrapped, so a database hiccup degrades to the gradient band
// rather than to an error boundary over a browse page.

/** The precedence ladder, as data. `image` null = no section cover, i.e. the neutral gradient band. */
export interface IndexHeroDefault {
  /** The route or route-prefix this default covers ('/journeys' also covers '/journeys/x').
   *
   *  A segment may be the wildcard `_` (`PREFIX_WILDCARD`), which matches any ONE route segment:
   *  '/spaces/_/podcasts' covers every Space's Shows index. That is for the dynamic segment sitting
   *  in the MIDDLE of a path, which a leading prefix cannot name — see the ADR-1261 block below. */
  prefix: string
  /** The section's default cover under `public/images/site/`, or null for the gradient band. */
  image: string | null
  /** The band height. See the short/large note below — this is a product decision, not page taste. */
  size: HeaderSize
  /** Whether this surface ACCEPTS a hero inherited from its section's `page_content` row
   *  (PROG-P6, ADR-1122). Defaults to true. Set false on a UTILITY surface, for the same reason it
   *  takes `short` + the gradient: `/journeys/mine` is a management space, and the copy cascade
   *  handing it the Journeys section photo would silently overturn the product decision the
   *  short/large note below spells out. The flag is what makes that decision survive the cascade
   *  instead of being quietly reversed by it. */
  inheritHero?: boolean
  /** WHICH KEY rungs 1 reads for a route under this row (ADR-1261).
   *
   *  `'route'` (the default, and what all 17 pages of the 2026-09-07 slice do) reads
   *  `page_settings` on the LITERAL pathname, so what an operator saves standing on the page is
   *  what the page reads back.
   *
   *  `'section'` reads it on THIS ROW'S PREFIX instead, which is the treatment `detail-hero.ts`
   *  has always given rung 2: one operator image behind every route in the section. Set it on a
   *  row whose section root is ITSELF a page an operator can stand on ('/help', '/discover/
   *  practices'), so the key a dynamic child reads is a key the Settings panel can write. Do NOT
   *  set it on a pattern row: the panel keys on `usePathname()`, so nothing can write
   *  '/spaces/_/podcasts' and the rung would be dead. */
  keyOn?: 'route' | 'section'
}

// ── SHORT vs LARGE IS A PRODUCT DECISION, HELD HERE SO IT CANNOT BECOME PER-PAGE TASTE ──────────
// PageHero owns the page's <h1> and renders it in font-display uppercase at
// clamp(1.75rem, 6vw, 3.75rem); `large` is min-h-[24rem] on desktop. That lockup is right for a
// DISCOVERY surface — a member arriving at /practices should meet the section, and the cover photo
// is doing real work. It is wrong for a UTILITY surface: "Your Journeys" is a management space a
// member returns to in order to get something done, and a 24rem gradient band with a billboard
// headline over it pushes the actual work below the fold on a phone for no gain.
//
// So the ladder splits: browse/discovery sections get `large` + a section cover; personal and
// operator surfaces get `short` + the gradient band. The band is still THE band — same component,
// same grammar, same operator Settings affordance under it — just sized for what it sits over.
// An operator who disagrees sets the height master in /admin/elements and wins over every row here
// (resolveHeaderElement treats these as the SURFACE default, ADR-793).
//
// LONGEST PREFIX WINS, so '/journeys/mine' takes the utility row and not '/journeys'.
export const INDEX_HERO_DEFAULTS: readonly IndexHeroDefault[] = [
  // Discovery — the section is the destination.
  { prefix: '/practices', image: '/images/site/meditation-circle.jpg', size: 'large' },
  { prefix: '/journeys', image: '/images/site/nature-viewing-sunset.jpg', size: 'large' },
  { prefix: '/library', image: '/images/site/community-1.jpg', size: 'large' },
  { prefix: '/network', image: null, size: 'large' },
  // Utility — the member came here to do something. `inheritHero: false` keeps the gradient band
  // even though '/journeys' and '/network' both carry an operator hero in production.
  //
  // '/events/calendar' is the exception that shows why the two flags are separate: it is a work
  // surface, so it takes `short`, but the operator's '/events' hero SHOULD reach it (the calendar is
  // the Events section wearing a different body), so it keeps the default `inheritHero: true`. The
  // section owns no map `image` because the Events cover lives with the events surface it heads.
  { prefix: '/events/calendar', image: null, size: 'short' },
  { prefix: '/journeys/mine', image: null, size: 'short', inheritHero: false },
  { prefix: '/network/contacts', image: null, size: 'short', inheritHero: false },
  { prefix: '/network/friends', image: null, size: 'short', inheritHero: false },

  // ── THE 2026-09-07 ADOPTION (LIVE-117, ADR-1255) ─────────────────────────────────────────────
  // The static-route half of the 24 `IndexTemplate` pages that drew no band at all. NO COVER IS
  // INVENTED: every row below carries `image: null` on purpose, so what a row buys is the band
  // itself plus rungs 1 and 2 — the operator's Settings header image for the route, and the
  // section hero the copy cascade already holds, both of which these pages were dropping on the
  // floor (the index-side echo of the /network bug, ADR-1122). Picking a stock photo per surface
  // is the per-page taste this map exists to prevent; a row earns a photo the day the owner
  // chooses one, here, in one line.
  //
  // Discovery — the section IS the destination, so the band is `large` and a section hero reaches
  // it. '/partners/collaborators' is deliberately absent: it is part of the Partners section and
  // takes the '/partners' row, which is what a prefix map is for.
  //
  // `keyOn: 'section'` on two of the five is the 2026-09-08 slice, not a 2026-09-07 change: for
  // '/help' and '/discover/practices' THEMSELVES the section key IS the pathname, so both pages
  // resolve byte-identically to the day they adopted. What it buys is their dynamic children.
  { prefix: '/help', image: null, size: 'large', keyOn: 'section' },
  { prefix: '/partners', image: null, size: 'large' },
  { prefix: '/housing/roommates', image: null, size: 'large' },
  { prefix: '/discover/partners', image: null, size: 'large' },
  { prefix: '/discover/practices', image: null, size: 'large', keyOn: 'section' },
  // Utility — a member or an operator came here to get something done, so `short` + the gradient,
  // and `inheritHero: false` so the section photo above them cannot quietly overturn that.
  { prefix: '/circles/templates', image: null, size: 'short', inheritHero: false },
  { prefix: '/crew/leaderboard', image: null, size: 'short', inheritHero: false },
  { prefix: '/drafts', image: null, size: 'short', inheritHero: false },
  { prefix: '/lead/training-library', image: null, size: 'short', inheritHero: false },
  { prefix: '/market/manage', image: null, size: 'short', inheritHero: false },
  { prefix: '/messages', image: null, size: 'short', inheritHero: false },
  { prefix: '/orders', image: null, size: 'short', inheritHero: false },
  { prefix: '/partners/join', image: null, size: 'short', inheritHero: false },
  { prefix: '/search', image: null, size: 'short', inheritHero: false },
  { prefix: '/spaces/operating', image: null, size: 'short', inheritHero: false },
  { prefix: '/support', image: null, size: 'short', inheritHero: false },

  // ── THE 2026-09-08 SLICE (LIVE-117, ADR-1261) — THE DYNAMIC ROUTES ───────────────────────────
  // The five Space tabs that render OUTSIDE the (profile) route group, so nothing draws a band
  // above them (ADR-1255 re-measured that). Their dynamic segment is in the MIDDLE of the path, so
  // they are reached by a `_` pattern prefix; the only literal prefix that matched them was
  // '/spaces', which is one row for five different surfaces and would also have swallowed
  // '/spaces/directory'.
  //
  // THEY DO NOT TAKE `keyOn: 'section'`, and that is the honest half of this slice. A pattern
  // prefix is a fine MATCHER and a dead KEY: the Settings panel writes `page_settings` on
  // `usePathname()`, so the only key any UI can write for these is the tenant's own literal path.
  // Rung 1 therefore stays per Space, which is also the right answer for a tenant surface: each
  // Space's own operator sets their own band. What no key can express today is one image behind
  // every Space's copy of a tab; that is a writer question, not a resolver one.
  //
  // `inheritHero: false` on all five, INCLUDING the public Shows index. The copy cascade climbs a
  // tenant path through '/spaces/<slug>' to '/spaces' — the site's own marketing page — and one
  // brand's Space must never wear the house photo from a page about Spaces in general.
  { prefix: '/spaces/_/journeys', image: null, size: 'short', inheritHero: false },
  { prefix: '/spaces/_/loom', image: null, size: 'short', inheritHero: false },
  { prefix: '/spaces/_/manage/circles', image: null, size: 'short', inheritHero: false },
  { prefix: '/spaces/_/practices', image: null, size: 'short', inheritHero: false },
  // The one PUBLIC surface of the five: a Space's Shows catalog, anonymous-reachable and
  // sitemap-advertised, so it is a destination and takes the discovery band.
  { prefix: '/spaces/_/podcasts', image: null, size: 'large', inheritHero: false },
] as const

/** The fallback for a route no row covers: gradient band at the shipped directory height. */
export const INDEX_HERO_FALLBACK: Omit<IndexHeroDefault, 'prefix'> = { image: null, size: 'large', inheritHero: true }

// ── WHY THERE IS NO `'none'` TAIL HERE, AND WHY THERE WILL NOT BE ONE (LIVE-117 (a), ADR-1255) ──
// `detail-hero.ts` has a `tail: 'none'`, and the obvious symmetry says this ladder should grow one
// too, so an adoption could be staged invisibly. It should not, and the reason is structural rather
// than stylistic: on a DETAIL page the cover is decoration under an `<h1>` the context header
// already renders, so 'none' means "draw no decoration". On an INDEX the band CARRIES the `<h1>`
// (`IndexTemplate`'s `heroOverlay` branch suppresses `PageHeading`), so a 'none' tail would not be
// a hero resolution at all — it would be the page choosing a different HEADER GRAMMAR, which is
// `IndexTemplate`'s decision and not this map's. Encoding it here would put `heroOverlay` back
// under a per-page conditional, i.e. hand the choice back to the pages this map exists to take it
// away from. Staging is done by ADOPTING IN SLICES, which is what LIVE-117 does.

/** PURE: the section default for a route, longest prefix wins. Exported for the unit test and for
 *  any caller that wants the section cover without resolving the whole band. */
export function indexHeroDefaultsFor(route: string): Omit<IndexHeroDefault, 'prefix'> {
  // `longestPrefixRow` is the shared primitive (lib/layout/content-cascade.ts) — this loop was
  // written by hand here, again in detail-hero.ts, and was about to be written a third time.
  const best = longestPrefixRow(route, INDEX_HERO_DEFAULTS)
  return best
    ? { image: best.image, size: best.size, inheritHero: best.inheritHero ?? true }
    : INDEX_HERO_FALLBACK
}

// ── THE SETTINGS KEY, AND WHAT A PREFIX KEY CAN AND CANNOT EXPRESS (LIVE-117, ADR-1261) ────────
// `resolveIndexHero`'s route argument used to be BOTH the thing the ladder is resolved for and the
// `page_settings` key rung 1 reads. For a literal pathname those are the same string, which is why
// nothing separated them for the first 17 adopters. For a DYNAMIC route they are not: a page whose
// pathname carries a slug has no key an operator can reach, so rung 1 read a per-URL key nobody
// could write, which is exactly why those seven pages were deferred rather than adopted blind.
//
// The key is now its own function, and the map decides it. `detail-hero.ts` has always done this
// (`detailHeroDefaultsFor` returns the SECTION prefix and rung 2 reads `page_settings` on that,
// with an optional `spaceId` for the tenant layer); the index side gets the same treatment behind
// a per-row opt-in, so no shipped page changes key.
//
// WHAT IT CAN EXPRESS: one operator image standing behind every route in a section whose root is
// itself a page — '/help/<category>' reads the image an operator set on '/help'.
// WHAT IT CANNOT: a key for every tenant's copy of a tab. `page_settings` is an exact-match read
// and the only writer (the on-page Settings panel) keys on `usePathname()`, so '/spaces/_/podcasts'
// would be a key with no writer. Those rows keep the literal pathname and the tenant sets their
// own. Nor does this side grow a `spaceId` option to match the detail hero's: the panel passes no
// space, so every index read must stay on the root tenant to see what the panel actually wrote.
// A parameter no writer can honour is the same dead rung wearing a different name.

/** PURE: the `page_settings` key for an index route — the row's prefix when the row asks for the
 *  section key, else the literal route. Exported for the unit test and for any caller that needs
 *  to name the key an operator would have to write. */
export function indexHeroKeyFor(route: string): string {
  const row = longestPrefixRow(route, INDEX_HERO_DEFAULTS)
  return row?.keyOn === 'section' ? row.prefix : route
}

/** What a page can say about its own hero, over and above the route defaults. */
export interface IndexHeroOptions {
  /** The page-content hero (ADR-180) — sits BELOW the operator's Settings header image and ABOVE
   *  the section default.
   *
   *  🔴 YOU NO LONGER NEED TO PASS THIS. `resolveIndexHero` reads the copy cascade itself
   *  (PROG-P6, ADR-1122), so a route beneath a section with a hero gets one without the page
   *  saying anything. Pass it only to OVERRIDE that read; `undefined` means "resolve it", and an
   *  explicit `null` means "there is none", which is why the check below is `!== undefined`. */
  contentImage?: string | null
  /** An explicit section default for this call, winning over the route map's `image`. Pass it when
   *  a page's cover genuinely is page-specific; prefer adding a row to INDEX_HERO_DEFAULTS. */
  fallbackImage?: string | null
  /** Override the map's band height for this surface (still beaten by an operator master value). */
  size?: HeaderSize
  /** The surface's default hero layout variant. Defaults to the shipped centered `overlay`. */
  layout?: PageHeroVariant
}

/** The spreadable `IndexTemplate` prop bag for an overlay hero band. */
export interface IndexHeroProps {
  heroImage: string | null
  heroFocus: string | null
  heroOverlay: true
  heroLayout: PageHeroVariant
  heroSize: HeaderSize
  heroScrim: boolean
}

/** PURE: fold the resolved inputs into the prop bag. The IMAGE ladder, top to bottom:
 *
 *    1. the operator's Settings header image for this route (page_settings)
 *    2. the page-content hero (ADR-180), which `resolveIndexHero` now resolves through the copy
 *       cascade — this route's own row, else the nearest section's, else the site row
 *       (PROG-P6, ADR-1122)
 *    3. an explicit `fallbackImage`, else the route's section default
 *    4. null — the neutral gradient band, which is a RESULT and not a failure
 *
 *  The FOCAL POINT rides rung 1 only: it is picked against the operator's own upload, so applying
 *  it to a fallback would crop a different photo by someone else's coordinates. Every adopter's
 *  hand-rolled stanza already said this in a comment; now it is one line that cannot drift.
 *  Exported so the ladder is unit-testable without a database. */
export function pickIndexHero(
  route: string,
  inputs: {
    operatorImage: string | null
    operatorFocus: string | null
    header: { layout: PageHeroVariant; height: HeaderSize; scrim: boolean }
  },
  opts: IndexHeroOptions = {},
): IndexHeroProps {
  const section = indexHeroDefaultsFor(route)
  const heroImage =
    inputs.operatorImage ?? opts.contentImage ?? opts.fallbackImage ?? section.image ?? null
  return {
    heroImage,
    heroFocus: inputs.operatorImage ? inputs.operatorFocus : null,
    heroOverlay: true,
    heroLayout: inputs.header.layout,
    heroSize: inputs.header.height,
    heroScrim: inputs.header.scrim,
  }
}

/** Resolve the overlay hero band for an index route: read the operator's image + focal point and
 *  the operator-tunable header element, then fold them with the route's section defaults through
 *  `pickIndexHero`. Spread the result straight into `IndexTemplate`. FAIL-SAFE. */
export async function resolveIndexHero(
  route: string,
  opts: IndexHeroOptions = {},
): Promise<IndexHeroProps> {
  const section = indexHeroDefaultsFor(route)
  // Rung 1's key (see the block above): the section prefix where the map asks for it, else the
  // literal pathname. Rung 2 is deliberately NOT re-keyed — the copy cascade climbs a route's real
  // ancestors on its own, so a dynamic path already inherits '/help' or '/spaces/<slug>' without a
  // synthetic key, and handing it a pattern would only cost it the rungs in between.
  const settingsKey = indexHeroKeyFor(route)
  const defaults = { layout: opts.layout ?? ('overlay' as const), height: opts.size ?? section.size }
  try {
    // The header element resolves the operator's layout / height / scrim masters over this
    // surface's defaults (ADR-793). The focal point is only read when there IS an operator image,
    // so a route with none costs one page_settings read, not two (both are request-cached anyway).
    // The copy cascade is read here too, so rung 2 fills itself in (see below).
    const [operatorImage, header, cascade] = await Promise.all([
      getPageHeaderImage(settingsKey),
      resolveHeaderElement({ defaults }),
      opts.contentImage !== undefined ? Promise.resolve(null) : resolveContentCascade(route, {}),
    ])
    const operatorFocus = operatorImage ? await getPageHeaderFocus(settingsKey) : null
    // RUNG 2, RESOLVED RATHER THAN PASSED. Every adopter that wanted the page-content hero had to
    // hand it in, and `/network` is the proof that this fails silently: it resolves the very same
    // content for its title and description, drops `heroImage` on the floor, and its operator's
    // uploaded directory cover has been invisible in production since it was set. An INHERITED hero
    // additionally has to clear the surface's `inheritHero` gate; a hero set on the route itself
    // never does, because that is not inheritance.
    const inherited = cascade && cascade.origin.hero !== 'page'
    const contentImage =
      opts.contentImage !== undefined
        ? opts.contentImage
        : inherited && section.inheritHero === false
          ? null
          : (cascade?.heroImage ?? null)
    return pickIndexHero(route, { operatorImage, operatorFocus, header }, { ...opts, contentImage })
  } catch {
    // Nothing above throws today (both readers swallow their own errors), so this is the belt to
    // the braces: a browse page never loses its header to a settings read.
    return pickIndexHero(
      route,
      {
        operatorImage: null,
        operatorFocus: null,
        header: { layout: defaults.layout, height: defaults.height, scrim: true },
      },
      opts,
    )
  }
}

// ── THE EDITABLE-INDEX TWIN ─────────────────────────────────────────────────────────────────────
// Nine browse render sites do NOT compose `IndexTemplate`. They are the sanctioned "editable index"
// (PAGE-FRAMEWORK §8.5): a `MarketHero` header over an operator-rearrangeable body. `MarketHero` is
// a thin wrapper over the SAME `PageHero`, so the band is already identical — but every one of those
// nine resolved its image by hand, and every one of them stopped at rung 2. Measured 2026-08-25:
// `getPageHeaderImage` appears in exactly THREE of the 41 browse render sites in the tree. The
// operator's Settings > Basics header-image uploader is offered on any safe route (savePageSeo gates
// on `isSafeRoute`, not on an allowlist), so on the other 38 an operator can upload a header image
// and watch nothing happen. That is /network's bug (ADR-1122) at scale, and it is why "universal"
// here means one LADDER over both compositions, not one template.
//
//   const hero = await resolveMarketHero('/store', { cover: HERO_IMAGE })
//   return <MarketHero {...hero} title="Wear it, gift it, show up" … />

/** The spreadable `MarketHero` prop bag — the editable-index twin of `IndexHeroProps`. Same four
 *  rungs, same focal-point rule; only the prop NAMES differ, because `MarketHero` predates them. */
export interface MarketHeroProps {
  image: string
  focal: string | null
  variant: PageHeroVariant
  size: HeaderSize
  overlay: boolean
}

/** PURE: re-shape a resolved index hero into `MarketHero`'s prop names.
 *
 *  `MarketHero` types `image` as a NON-NULL string — an editable index is hero-led, so the gradient
 *  band that is a legitimate result on a utility index would be a broken header here. `cover` is
 *  therefore required and carries that guarantee in the type, rather than leaving a `?? SOMETHING`
 *  at each of the nine call sites for the ladder to fall through to. */
export function asMarketHero(hero: IndexHeroProps, cover: string): MarketHeroProps {
  return {
    image: hero.heroImage ?? cover,
    focal: hero.heroFocus,
    variant: hero.heroLayout,
    size: hero.heroSize,
    overlay: hero.heroScrim,
  }
}

/** Resolve the hero band for an EDITABLE-INDEX route through the same ladder `resolveIndexHero`
 *  uses, shaped for `MarketHero`. `cover` is the page's coded cover, i.e. rung 3. FAIL-SAFE. */
export async function resolveMarketHero(
  route: string,
  opts: IndexHeroOptions & { cover: string },
): Promise<MarketHeroProps> {
  const { cover, ...rest } = opts
  const hero = await resolveIndexHero(route, { ...rest, fallbackImage: rest.fallbackImage ?? cover })
  return asMarketHero(hero, cover)
}
