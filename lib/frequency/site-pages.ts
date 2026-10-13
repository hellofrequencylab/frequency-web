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
}

export const DEFAULT_PAGE: SitePageState = { mood: 'page', energy: 'flow', hues: ['v', 'm', 'a'], side: 'p', locked: true }

/** The README's table, by route. Features / Stories / Join / Help rows join when their routes do. */
export const SITE_PAGES: Record<string, SitePageState> = {
  [ROUTES.home]: { mood: 'home', energy: 'charge', hues: ['m', 'a', 's'], side: 'p', locked: false },
  [ROUTES.people]: { mood: 'people', energy: 'flow', hues: ['a', 'v', 'c'], side: 'p', locked: true },
  [ROUTES.spaces]: { mood: 'spaces', energy: 'flow', hues: ['s', 'm', 'v'], side: 'e', locked: true },
  [ROUTES.pricing]: { mood: 'pricing', energy: 'still', hues: ['s', 'v', 'a'], side: 'e', locked: true, quiet: 1 },
  [ROUTES.vision]: {
    mood: 'vision',
    energy: 'still',
    hues: ['v', 'c', 'l'],
    side: 'p',
    locked: true,
    cta: { href: ROUTES.help, label: 'Talk to us' },
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
