import { layoutScopeChain, type LayoutConfig } from './layout'

// Per-route DEFAULT layouts — a coded starting layout for a route/section whose registry default
// (Single template, every module stacked in `main`) isn't the right out-of-the-box shape. Both the
// renderer (loadLayoutForRoute) and the editor (getPageLayoutForEditor) fall back to this when NO
// layout is saved at any level of the route's cascade, so the page renders right out of the box AND
// the Layout editor opens showing that same starting point (no renderer/editor divergence). A saved
// config at any scope still wins. Pure data (only a type + helper from ./layout) — safe to import in
// the server store, the server action, and the client editor alike.
//
// Circles (/circles/<slug>): a two-column body — the feed leads MAIN, a SHORT info-rail fills SIDE.
const ROUTE_DEFAULT_LAYOUTS: Record<string, LayoutConfig> = {
  // THE CIRCLE RAIL CARRIES FOUR VISIBLE MODULES (owner ruling, 2026-08-13). The 2026-08-12 trim
  // capped it at three on right-rail eyetracking grounds and dropped the roster on the reasoning
  // that "the roster has its own tab now". The owner put two back by name: *"Put the member list
  // back in the right column on the main page"* and *"Put Events in the right column on the main"*.
  // A tab and a rail box are not the same affordance — the box is who is here right now, the tab is
  // the roster you go and browse — and the owner reads the Circle page as incomplete without both.
  // Ordered by the same rule as before: (a) time-bound before evergreen · (b) action before
  // information · (c) decision-relevant before status. Which gives, top to bottom:
  //   1. circle-events   — what is on next, and the way in to RSVP. Time-bound and decision-
  //      relevant, so it leads. It sits here AND on the Program tab, deliberately: the tab is the
  //      full calendar, this is the next thing.
  //   2. circle-members  — who is actually in the room. The roster tab still exists and still
  //      carries the browse/manage affordances; this is the at-a-glance.
  //   3. circle-practice — this week's practice with its log button. The one member ACTION here.
  //   4. circle-meeting  — how and where we meet. Evergreen orientation, so it goes last.
  // The three below it are PLACED BUT OFF, not deleted: an operator turns any of them back on with
  // one toggle in the Layout editor, and the id stays in the circle module set so the editor keeps
  // offering it. Why each is off by default:
  //   • circle-map      — the largest box in the column, and it repeats in a picture what "How we
  //     meet" says in a line.
  //   • circle-momentum — it moved to the Circle Stats tab (owner ruling: *"Bring back Momentum
  //     blocks and put them in the leaderboard"*), which is where a member goes to read status.
  //     Rendering it in the rail as well would put the same four numbers on the page twice.
  //   • circle-health   — status, and manager-facing: the same three numbers render in the admin
  //     rail's `circle.insights` module for exactly the people who can act on them.
  // The two HOST WRITE blocks that used to live here are gone from the page entirely (they are out
  // of CIRCLE_DETAIL_MODULE_IDS, so no saved layout can resurrect them): invites already render in
  // the `circle.people` admin module, and Start a Run moved into `circle.engage`. A write action
  // used weekly by one member in thirty does not belong in the column the other twenty-nine read.
  //
  // MAIN leads with the shared challenges (self-hiding, so most circles show nothing there) and
  // then the feed, because a feed has no bottom: anything placed under it is placed nowhere. The
  // movable Page text block leads the header slot (empty by default → renders nothing until a
  // circle or the network default sets text); operators can move it anywhere.
  //
  // EVERY id in the circle module set is placed here explicitly, on or off. An unplaced id is
  // auto-appended to the template's FIRST slot, which on 'header-side' is the full-width header —
  // that is how "How we meet" used to render above the circle feed.
  '/circles/*': {
    template: 'header-side',
    slots: {
      header: { order: ['circle-text'], hidden: [], roles: {} },
      main: { order: ['circle-challenges', 'circle-feed'], hidden: [], roles: {} },
      side: {
        order: [
          // The four that render.
          'circle-events',
          'circle-members',
          'circle-practice',
          'circle-meeting',
          // Placed but off — one toggle from the Layout editor brings any of them back.
          'circle-map',
          'circle-momentum',
          'circle-health',
        ],
        hidden: ['circle-map', 'circle-momentum', 'circle-health'],
        roles: {},
      },
    },
  },

  // Events (/events/<slug>): the FULL interior is arrangeable, but this is the ONE canonical layout
  // every event shares unless an operator deliberately rearranges it (per-event saved layouts were
  // cleared so every event reads the same — same boxes, same order). MAIN carries the content the
  // host wrote + the conversation (description → activity → the Host profile box → poster sections →
  // recap), then the ONE canonical venue block (event-location: the address line + its map) pinned
  // at the bottom; SIDE is the at-a-glance + action column: RSVP first, then when/where facts, and
  // cohosts. The header still shows the address (with its Maps deep-link); the bottom-of-main
  // event-location is the single map on the page (the redundant bare `event-venue-map` and the
  // duplicate `event-gallery` were dropped from the event module set). The host "Post an update"
  // composer is folded into activity (one role-based composer); the poster "Details" block stays
  // re-addable from Settings → Layout. Ticketing lives in the RSVP/Join box (event-join) — the sold
  // count is folded onto the ticket card — so the poster 'event-pricing' box and the host
  // 'event-sales' box are gone from the event set.
  '/events/*': {
    template: 'main-side',
    slots: {
      main: {
        order: [
          'event-description',
          'event-activity',
          'event-lineup',
          'event-good-to-know',
          'event-links',
          'event-sponsors',
          'event-recap',
          // The ONE canonical venue block — the address line + its map — pinned at the bottom of the
          // main column (self-hides for an online event or when there's no address/geo).
          'event-location',
        ],
        hidden: [],
        roles: {},
      },
      side: {
        order: [
          // Warm proof (the who's-coming pile) lives INSIDE the unified event-join RSVP box
          // (ADR-826); its standalone module (and the retired facts card) stays registered but
          // renders null, so the default lists neither. The Event Details card (event-when-where:
          // date · time · recurrence · add-to-calendar) sits right under the RSVP box — it now
          // carries the when facts + calendar links the RSVP box used to hold (owner spec).
          'event-join',
          'event-when-where',
          'event-schedule',
          'event-cohosts',
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
