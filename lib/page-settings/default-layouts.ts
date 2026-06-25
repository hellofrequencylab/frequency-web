import { layoutScopeChain, type LayoutConfig } from './layout'

// Per-route DEFAULT layouts — a coded starting layout for a route/section whose registry default
// (Single template, every module stacked in `main`) isn't the right out-of-the-box shape. Both the
// renderer (loadLayoutForRoute) and the editor (getPageLayoutForEditor) fall back to this when NO
// layout is saved at any level of the route's cascade, so the page renders right out of the box AND
// the Layout editor opens showing that same starting point (no renderer/editor divergence). A saved
// config at any scope still wins. Pure data (only a type + helper from ./layout) — safe to import in
// the server store, the server action, and the client editor alike.
//
// Circles (/circles/<slug>): a two-column body — the feed leads MAIN, the info-rail blocks fill
// SIDE — matching the hand-built layout the module engine replaces.
const ROUTE_DEFAULT_LAYOUTS: Record<string, LayoutConfig> = {
  // The operator-approved circle layout (the configuration set on MoFlow Encinitas, adopted as the
  // template for every circle): the feed + upcoming events lead MAIN; the info-rail (map first, then
  // practice · members · health · momentum · invite · journey-run) fills SIDE. header-side leaves a
  // header slot free for future top-of-page blocks.
  '/circles/*': {
    template: 'header-side',
    slots: {
      header: { order: [], hidden: [], roles: {} },
      main: { order: ['circle-feed', 'circle-events'], hidden: [], roles: {} },
      side: {
        order: [
          'circle-map',
          'circle-practice',
          'circle-members',
          'circle-health',
          'circle-momentum',
          'circle-invite',
          'circle-journey-run',
        ],
        hidden: [],
        roles: {},
      },
    },
  },
}

/** The coded default layout for a concrete route, resolving the same exact→section→global chain as
 *  the saved-layout cascade (most-specific first), or null when the route registers no default. */
export function defaultLayoutFor(route: string): LayoutConfig | null {
  for (const key of layoutScopeChain(route)) {
    const c = ROUTE_DEFAULT_LAYOUTS[key]
    if (c) return c
  }
  return null
}
