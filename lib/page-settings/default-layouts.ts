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
  // practice · members · health · momentum · invite · journey-run) fills SIDE. The movable Page text
  // block leads the header slot (empty by default → renders nothing until a circle or the network
  // default sets text); operators can move it anywhere from the Layout editor.
  '/circles/*': {
    template: 'header-side',
    slots: {
      header: { order: ['circle-text'], hidden: [], roles: {} },
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

  // Events (/events/<slug>): the FULL interior is arrangeable, but this is the ONE canonical layout
  // every event shares unless an operator deliberately rearranges it (per-event saved layouts were
  // cleared so every event reads the same — same boxes, same order). MAIN carries the content the
  // host wrote + the conversation (description → activity → the poster sections → recap); SIDE is the
  // at-a-glance + action column: RSVP first, then when/where facts, the venue MAP (a tall 4:6 card),
  // cohosts, and host-only ticket sales. The host "Post an update" composer is folded into activity
  // (one role-based composer); the poster "Details" block stays re-addable from Settings → Layout.
  '/events/*': {
    template: 'main-side',
    slots: {
      main: {
        order: [
          'event-description',
          'event-activity',
          'event-lineup',
          'event-good-to-know',
          'event-pricing',
          'event-links',
          'event-sponsors',
          'event-recap',
        ],
        hidden: [],
        roles: {},
      },
      side: {
        order: [
          'event-join',
          'event-schedule',
          'event-facts',
          'event-location',
          'event-warm-proof',
          'event-cohosts',
          'event-sales',
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
