// THE PUBLIC SITE'S PAGE TABLE (templates/website/README.md "Page state attributes", fx.js MOODS).
// Status lives in docs/BUILD-BACKLOG.json; this file is data.
//
// Every marketing page sets four things on the kit root: its side (People or Spaces, and whether it is
// locked), its mood (the page name, `data-mood`), its energy (`data-energy-page`: still / flow / charge)
// and three hues (`--fq-m1..3`). fx.js read them from a table keyed by file name; here the table is keyed
// by route, so the server renders the right attributes in the first paint and nothing flashes.
//
// A page that is not in the table gets DEFAULT_PAGE. A page lane adds its row here (first paint), or
// renders <SitePage …/> in its body to override after hydration.

import { ROUTES, type Side } from '@/lib/frequency/site-nav'

export type Energy = 'still' | 'flow' | 'charge'

/**
 * Which of the two site themes a page's BODY wears (guidelines/site-themes.md, ADR-1740). The header and
 * the footer are Stage on every page; only <main> changes.
 *
 *   stage    dark, the design's marketing pages: sell the feeling (Home, People, Spaces, Pricing, …).
 *   commons  light (Thermal at night), where doing and reading happen: listings and the town calendar
 *            (/discover), public detail pages (app/(public)), legal and utility pages. The site-themes
 *            rule: never put long reading on Stage.
 *
 * Each layout passes its family's default to <SiteShell surface>; a row here (or <SitePage surface>)
 * overrides it for one route. Rendered as `data-surface` on the kit root, so a body's CSS can follow it.
 */
export type Surface = 'stage' | 'commons'

/** The hue keys fx.js uses: violet, magenta, aqua, sun, UV cyan, UV lime, and the side colour. */
export type Hue = 'v' | 'm' | 'a' | 's' | 'c' | 'l' | 'side'

export const HUE_VAR: Record<Hue, string> = {
  v: 'var(--fq-x-violet-neon)',
  m: 'var(--fq-x-magenta-neon)',
  a: 'var(--fq-x-aqua-neon)',
  s: 'var(--fq-x-sun-neon)',
  c: 'var(--fq-uv-cyan)',
  l: 'var(--fq-uv-lime)',
  side: 'var(--fq-side)',
}

/** The header's primary action: the side pair (p-only / e-only), none, or a page's own. */
export type HeaderCta = 'side' | 'none' | { href: string; label: string }

export interface SitePageState {
  /** `data-mood`, the page's name in fx.js. */
  mood: string
  energy: Energy
  hues: [Hue, Hue, Hue]
  side: Side
  /** A locked page keeps its side (body[data-lock]); only Home toggles and remembers it. */
  locked: boolean
  /** 1 = Pricing (fewer, fainter orbs), 2 = Help (orbs in the hero only). */
  quiet?: 1 | 2
  cta?: HeaderCta
  /** The body's theme. Unset: the layout's default (SiteShell `surface`). */
  surface?: Surface
}

export const DEFAULT_PAGE: SitePageState = { mood: 'page', energy: 'flow', hues: ['v', 'm', 'a'], side: 'p', locked: true }

/** The README's table, by route. The Features row joins when its route does. */
export const SITE_PAGES: Record<string, SitePageState> = {
  [ROUTES.home]: { mood: 'home', energy: 'charge', hues: ['m', 'a', 's'], side: 'p', locked: false },
  [ROUTES.people]: { mood: 'people', energy: 'flow', hues: ['a', 'v', 'c'], side: 'p', locked: true },
  // The design's Spaces header sends its CTA to Join.html#spaces: the visitor is already on Spaces.
  [ROUTES.spaces]: {
    mood: 'spaces',
    energy: 'flow',
    hues: ['s', 'm', 'v'],
    side: 'e',
    locked: true,
    cta: { href: ROUTES.join, label: 'Open your Space' },
  },
  // Features: flow, violet / aqua / sun. Each half sets its own side colour (People aqua, Spaces sun).
  ...(ROUTES.features
    ? { [ROUTES.features]: { mood: 'features', energy: 'flow', hues: ['v', 'a', 's'], side: 'p', locked: true } satisfies SitePageState }
    : {}),
  [ROUTES.pricing]: { mood: 'pricing', energy: 'still', hues: ['s', 'v', 'a'], side: 'e', locked: true, quiet: 1 },
  '/stories': { mood: 'stories', energy: 'flow', hues: ['m', 's', 'v'], side: 'p', locked: true },
  // Join is the one page besides Home that is not locked: its Looking / Hosting switch is the side
  // switch (`data-set`), as Join.html runs it, and it reads `#people` / `#spaces` on arrival. Its
  // header carries no primary action, as in the reference: the page IS the action.
  [ROUTES.join]: { mood: 'join', energy: 'flow', hues: ['side', 'm', 'v'], side: 'p', locked: false, cta: 'none' },
  // Help: orbs in the hero only, and the header's action is Get started (Help.html).
  [ROUTES.help]: {
    mood: 'help',
    energy: 'still',
    hues: ['v', 'a', 'v'],
    side: 'p',
    locked: true,
    quiet: 2,
    cta: { href: ROUTES.join, label: 'Get started' },
  },
  [ROUTES.vision]: {
    mood: 'vision',
    energy: 'still',
    hues: ['v', 'c', 'l'],
    side: 'p',
    locked: true,
    cta: { href: `${ROUTES.vision}#partner`, label: 'Talk to us' },
  },
}

/** The row for a pathname: exact, then the longest matching section prefix, then the default. */
export function resolveSitePage(pathname: string | null | undefined): SitePageState {
  const path = (pathname || '/').replace(/\/+$/, '') || '/'
  if (SITE_PAGES[path]) return SITE_PAGES[path]
  let best: string | null = null
  for (const route of Object.keys(SITE_PAGES)) {
    if (route !== '/' && path.startsWith(`${route}/`) && (!best || route.length > best.length)) best = route
  }
  return best ? SITE_PAGES[best] : DEFAULT_PAGE
}

/** The kit root's mood custom properties (`--fq-m1..3`), as a React style object. */
export function moodStyle(state: Pick<SitePageState, 'hues'>): Record<string, string> {
  return { '--fq-m1': HUE_VAR[state.hues[0]], '--fq-m2': HUE_VAR[state.hues[1]], '--fq-m3': HUE_VAR[state.hues[2]] }
}
