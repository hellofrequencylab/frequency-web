import 'server-only'

import { getPageHeaderImage, getPageHeaderFocus } from '@/lib/page-settings/store'
import { resolveHeaderElement } from '@/lib/elements/header'
import type { PageHeroSize, HeroOverlayStyle } from '@/components/templates/page-hero'

// DETAIL HERO — the ONE resolver for a single-entity page's cover band (PROG-P5, ADR-1115,
// PAGE-FRAMEWORK §8.5). The DETAIL-side twin of `lib/layout/index-hero.ts` (PROG-P4).
//
// `DetailTemplate` has carried `coverImage` / `coverFocus` / `coverSize` / `coverOverlayStyle`
// since the cover props landed, and setting any of the last three routes the cover through the
// canonical `PageHero` (`variant="minimal"`, `heading={false}`) — the same component the index
// band renders. What was missing was a place to put the stanza every adopter re-typed: resolve
// the header ELEMENT for height + overlay, read the entity's own cover and focal point, decide
// what shows when the entity has none, and remember that the host's own stored height beats the
// element while an unset one defers to it. `/channels/[id]` and `/circles/[slug]` each carry a
// near-identical copy of that today. This module is the one copy.
//
// Call it, spread it:
//
//   const hero = await resolveDetailHero(`/practices/${id}`, { entityImage: practice.header_image })
//   return <DetailTemplate {...hero} title={practice.title} …>
//
// SERVER-ONLY (it reads page_settings + element_settings through service-role clients) and
// FAIL-SAFE: every read it makes already resolves to null / the registry defaults on any error,
// and the whole resolve is additionally wrapped, so a database hiccup degrades to the entity's
// own cover — or to no cover — rather than to an error boundary over an entity page.

// ── WHY THE LADDER IS INVERTED FROM THE INDEX SIDE ─────────────────────────────────────────────
// On a browse page the OPERATOR owns the surface, so `resolveIndexHero` puts the operator's
// Settings image on rung 1. On an entity page the entity's own owner does: a host who uploads a
// cover for THEIR Circle, Practice or Channel must not be outranked by a site-wide setting. So
// rung 1 here is the entity's image and the operator's section image sits behind it as the thing
// that stands in for every entity in the section that has none. Same four rungs, deliberately
// opposite order, and the reason is whose surface it is.

/** Where a section's cover band lands when nothing above it resolved.
 *
 *  `'placeholder'` paints `DetailTemplate`'s neutral gradient band (an explicit `coverImage={null}`);
 *  `'none'` renders no cover at all (`coverImage` stays `undefined`, the page is byte-identical to
 *  before it adopted).
 *
 *  THIS IS THE ONE PLACE THE INDEX AND DETAIL BANDS GENUINELY DIVERGE, and it is not taste. On an
 *  index the band CARRIES the page's `<h1>` (`heroOverlay`), so it must always exist and the null
 *  tail is the band still doing its job. On a detail page the `<h1>` lives in the context header
 *  BELOW the cover, so the cover is decoration — and a grey rectangle with an icon in it over every
 *  Hub, help article and public profile is chrome nobody asked for.
 *
 *  The placeholder is an AFFORDANCE, so it belongs on the surface where someone can act on it: a
 *  section whose cover is editable in place (the admin-settings scope kit, §8.5) shows the empty
 *  slot to the host who can fill it, and its public twin, where the viewer can do nothing about it,
 *  does not. That is why `/practices` and `/discover/practices` — the same entity — take different
 *  tails. */
export type DetailHeroTail = 'placeholder' | 'none'

/** The precedence ladder, as data. One row per SECTION, keyed by route prefix. */
export interface DetailHeroDefault {
  /** The section route this row covers ('/practices' also covers '/practices/<id>').
   *  It is ALSO the `page_settings` key read for rung 2 — an operator sets one image for the
   *  section in Settings and it stands behind every entity beneath it. */
  prefix: string
  /** The section's default cover under `public/images/site/`, or null for no section cover. */
  image: string | null
  /** The band height offered to `resolveHeaderElement` as this SURFACE's default (ADR-793), so an
   *  operator height master still wins, and the entity's own stored height wins over both. */
  size: PageHeroSize
  /** What shows when the whole ladder came up empty. See `DetailHeroTail`. */
  tail: DetailHeroTail
}

// ── THE MAP IS THE OPT-IN, AND THAT IS THE SAFETY PROPERTY ─────────────────────────────────────
// An UNMAPPED route resolves to no cover (see DETAIL_HERO_FALLBACK), so adopting this resolver on
// a page whose section nobody has mapped and whose entity carries no image of its own is a visual
// NO-OP. A section joins the program by adding a row here — never by a page inventing a stanza.
//
// LONGEST PREFIX WINS, so '/discover/practices/x' takes the discover row and not '/discover'.
export const DETAIL_HERO_DEFAULTS: readonly DetailHeroDefault[] = [
  // Practices, in-app: the host can edit the cover in place, so an empty slot is an invitation.
  { prefix: '/practices', image: null, size: 'standard', tail: 'placeholder' },
  // Practices, public twin: the same entity, but the viewer cannot fill the slot — so no slot.
  { prefix: '/discover/practices', image: null, size: 'standard', tail: 'none' },
  // Topics (Channels), public: the entity carries `cover_image`; nothing stands in for it.
  { prefix: '/discover/topics', image: null, size: 'standard', tail: 'none' },
  // Circles, public: the public Circle read exposes no image at all, so the SECTION cover is what
  // gives every public Circle page a band — this is the rung-3 row, in production, on purpose.
  { prefix: '/discover/circles', image: '/images/site/group-of-friends.jpg', size: 'standard', tail: 'none' },
] as const

/** The fallback for a route no row covers: NO cover, at the shipped standard height. */
export const DETAIL_HERO_FALLBACK: Omit<DetailHeroDefault, 'prefix'> = {
  image: null,
  size: 'standard',
  tail: 'none',
}

/** The resolved section row for a route, plus the section route itself (`null` when unmapped) so
 *  the caller knows which `page_settings` key rung 2 reads. PURE. Exported for the unit test and
 *  for any caller that wants the section's answer without resolving the whole band. */
export function detailHeroDefaultsFor(
  route: string,
): Omit<DetailHeroDefault, 'prefix'> & { section: string | null } {
  let best: DetailHeroDefault | null = null
  for (const row of DETAIL_HERO_DEFAULTS) {
    if (route !== row.prefix && !route.startsWith(`${row.prefix}/`)) continue
    if (!best || row.prefix.length > best.prefix.length) best = row
  }
  return best
    ? { section: best.prefix, image: best.image, size: best.size, tail: best.tail }
    : { section: null, ...DETAIL_HERO_FALLBACK }
}

/** What a page can say about its own entity, over and above the section defaults. */
export interface DetailHeroOptions {
  /** THE ENTITY'S OWN COVER — rung 1. `circles.image_url`, `practices.header_image`,
   *  `topical_channels.cover_image`, and so on. */
  entityImage?: string | null
  /** The focal point stored against `entityImage` ("x% y%"). Applied ONLY when that image wins. */
  entityFocus?: string | null
  /** The host's OWN stored band height, and deliberately null-unless-chosen: with no stored choice
   *  the header element keeps deciding (ADR-793), and once a host picks one, theirs wins. This is
   *  exactly the `hasChannelHeroHeight(theme) ? readChannelHeroHeight(theme) : null` idiom the
   *  Channel and Circle pages already spell out by hand. */
  entitySize?: PageHeroSize | null
  /** The host's OWN stored overlay treatment (Circles' None/Shade/Blend), else the element's. */
  entityOverlayStyle?: HeroOverlayStyle | null
  /** An explicit section default for this call, winning over the map's `image`. Prefer a row. */
  fallbackImage?: string | null
  /** Override the map's band height for this surface (still beaten by an operator master value,
   *  and by the entity's own `entitySize`). */
  size?: PageHeroSize
  /** Override the map's tail for this surface. */
  tail?: DetailHeroTail
  /** Resolve the header element inside a Space's override layer. */
  spaceId?: string | null
}

/** The spreadable `DetailTemplate` prop bag for the standard entity cover.
 *
 *  `coverImage: undefined` means NO cover — `DetailTemplate` keys on `coverImage !== undefined`, so
 *  spreading the bag onto a page whose ladder came up empty leaves it exactly as it was. */
export interface DetailHeroProps {
  coverImage: string | null | undefined
  coverFocus: string | null
  coverSize: PageHeroSize
  coverOverlayStyle: HeroOverlayStyle
}

/** PURE: fold the resolved inputs into the prop bag. The IMAGE ladder, top to bottom:
 *
 *    1. the ENTITY's own cover (`entityImage`) — its owner uploaded it for THIS entity
 *    2. the operator's Settings header image for the SECTION route (page_settings)
 *    3. an explicit `fallbackImage`, else the section default from `DETAIL_HERO_DEFAULTS`
 *    4. the section's TAIL — the gradient placeholder, or no cover at all
 *
 *  THE FOCAL POINT TRAVELS WITH ITS IMAGE. A focal point is picked against one specific photo, so
 *  applying it to a different one crops someone else's picture by coordinates nobody chose. Rung 1
 *  carries `entityFocus`, rung 2 carries the operator's focal point for the section image, and
 *  rungs 3-4 carry none because nobody has ever framed a shipped section default. (`index-hero`
 *  states the narrower version of this rule — focus rides rung 1 only — because it has exactly one
 *  focus-bearing rung; this is the same rule with two.)
 *
 *  Exported so the ladder is unit-testable without a database. */
export function pickDetailHero(
  route: string,
  inputs: {
    operatorImage: string | null
    operatorFocus: string | null
    header: { height: PageHeroSize; overlayStyle: HeroOverlayStyle }
  },
  opts: DetailHeroOptions = {},
): DetailHeroProps {
  const section = detailHeroDefaultsFor(route)
  const tail = opts.tail ?? section.tail
  const cover = ((): { image: string | null | undefined; focus: string | null } => {
    if (opts.entityImage) return { image: opts.entityImage, focus: opts.entityFocus ?? null }
    if (inputs.operatorImage) return { image: inputs.operatorImage, focus: inputs.operatorFocus }
    const fallback = opts.fallbackImage ?? section.image ?? null
    if (fallback) return { image: fallback, focus: null }
    return { image: tail === 'placeholder' ? null : undefined, focus: null }
  })()
  return {
    coverImage: cover.image,
    coverFocus: cover.focus,
    // The entity's own stored choices beat the operator's masters, which beat the section default.
    coverSize: opts.entitySize ?? inputs.header.height,
    coverOverlayStyle: opts.entityOverlayStyle ?? inputs.header.overlayStyle,
  }
}

/** Resolve the standard cover band for an entity route: read the operator's SECTION image + focal
 *  point and the operator-tunable header element, then fold them with the entity's own cover and
 *  the section defaults through `pickDetailHero`. Spread the result straight into `DetailTemplate`.
 *  FAIL-SAFE. */
export async function resolveDetailHero(
  route: string,
  opts: DetailHeroOptions = {},
): Promise<DetailHeroProps> {
  const section = detailHeroDefaultsFor(route)
  // `minimal` is the layout, always: `DetailTemplate` renders the standard cover through PageHero's
  // minimal variant with `heading={false}`, because the page's single <h1> lives in the context
  // band below. The element is asked for the HEIGHT and the OVERLAY, which are the two things an
  // operator can meaningfully retune over a cover that carries no lockup of its own.
  const defaults = { layout: 'minimal' as const, height: opts.size ?? section.size }
  try {
    // An unmapped section has no `page_settings` key to read, and an entity that brought its own
    // cover has already won rung 1 — so neither costs a settings read. Both are request-cached
    // anyway; this only keeps a no-op adoption genuinely free.
    const wantsOperator = section.section !== null && !opts.entityImage
    const [operatorImage, header] = await Promise.all([
      wantsOperator ? getPageHeaderImage(section.section as string, opts.spaceId) : Promise.resolve(null),
      resolveHeaderElement({ defaults, ...(opts.spaceId ? { spaceId: opts.spaceId } : {}) }),
    ])
    const operatorFocus = operatorImage
      ? await getPageHeaderFocus(section.section as string, opts.spaceId)
      : null
    return pickDetailHero(route, { operatorImage, operatorFocus, header }, opts)
  } catch {
    // Nothing above throws today (both readers swallow their own errors), so this is the belt to
    // the braces: an entity page never loses its cover to a settings read.
    return pickDetailHero(
      route,
      {
        operatorImage: null,
        operatorFocus: null,
        header: { height: defaults.height, overlayStyle: 'shadow' },
      },
      opts,
    )
  }
}
