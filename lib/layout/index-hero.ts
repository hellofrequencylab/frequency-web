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
  /** The route or route-prefix this default covers ('/journeys' also covers '/journeys/x'). */
  prefix: string
  /** The section's default cover under `public/images/site/`, or null for the gradient band. */
  image: string | null
  /** The band height. See the short/large note below — this is a product decision, not page taste. */
  size: HeaderSize
  /** Whether this surface ACCEPTS a hero inherited from its section's `page_content` row
   *  (PROG-P6, ADR-1120). Defaults to true. Set false on a UTILITY surface, for the same reason it
   *  takes `short` + the gradient: `/journeys/mine` is a management space, and the copy cascade
   *  handing it the Journeys section photo would silently overturn the product decision the
   *  short/large note below spells out. The flag is what makes that decision survive the cascade
   *  instead of being quietly reversed by it. */
  inheritHero?: boolean
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
  { prefix: '/journeys/mine', image: null, size: 'short', inheritHero: false },
  { prefix: '/network/contacts', image: null, size: 'short', inheritHero: false },
  { prefix: '/network/friends', image: null, size: 'short', inheritHero: false },
] as const

/** The fallback for a route no row covers: gradient band at the shipped directory height. */
export const INDEX_HERO_FALLBACK: Omit<IndexHeroDefault, 'prefix'> = { image: null, size: 'large', inheritHero: true }

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

/** What a page can say about its own hero, over and above the route defaults. */
export interface IndexHeroOptions {
  /** The page-content hero (ADR-180) — sits BELOW the operator's Settings header image and ABOVE
   *  the section default.
   *
   *  🔴 YOU NO LONGER NEED TO PASS THIS. `resolveIndexHero` reads the copy cascade itself
   *  (PROG-P6, ADR-1120), so a route beneath a section with a hero gets one without the page
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
 *       (PROG-P6, ADR-1120)
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
  const defaults = { layout: opts.layout ?? ('overlay' as const), height: opts.size ?? section.size }
  try {
    // The header element resolves the operator's layout / height / scrim masters over this
    // surface's defaults (ADR-793). The focal point is only read when there IS an operator image,
    // so a route with none costs one page_settings read, not two (both are request-cached anyway).
    // The copy cascade is read here too, so rung 2 fills itself in (see below).
    const [operatorImage, header, cascade] = await Promise.all([
      getPageHeaderImage(route),
      resolveHeaderElement({ defaults }),
      opts.contentImage !== undefined ? Promise.resolve(null) : resolveContentCascade(route, {}),
    ])
    const operatorFocus = operatorImage ? await getPageHeaderFocus(route) : null
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
